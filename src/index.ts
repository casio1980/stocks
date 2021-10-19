import { CandleStreamingMacd } from "./types";
import { MACD } from "technicalindicators";
import { figiTWTR, STATUS_IDLE, STATUS_BUYING, STATUS_SELLING, STATUS_RETRY_SELLING, DATE_FORMAT } from "./const";
import getAPI from "./lib/api";
import log4js from "log4js";
import { Store } from "./store"
import { reaction } from "mobx"
import { fmtNumber } from "./lib/utils";
import moment from "moment";

require("dotenv").config();

log4js.configure({
  appenders: {
    console: { type: "console" },
    file: { type: "file", filename: "stocks.log" },
  },
  categories: {
    server: { appenders: ["file"], level: "trace" },
    default: { appenders: ["console", "file"], level: "trace" },
  },
});

const logger = log4js.getLogger(process.env.LOG_CATEGORY || "default");

const isProduction = process.env.PRODUCTION === "true";

const api = getAPI();

const figi = figiTWTR;
const currency = "USD";

const lots = 60
const takeLimit = 0.09
const stopLimit = 0.059

let positionUpdateInterval: NodeJS.Timeout = undefined

const candles: CandleStreamingMacd[] = []
const store = new Store()
store.setLimits({ takeLimit, stopLimit });

reaction(() => store.status, async (status) => {
  if ([STATUS_BUYING, STATUS_SELLING].includes(status)) {
    positionUpdateInterval = setInterval(async () => {
      const { positions } = await api.portfolio();
      const position = positions.find((el) => el.figi === figi);
      store.setPosition(position)
    }, 10000)
  }
})

reaction(() => store.position, async (position) => {
  if (store.status === STATUS_BUYING) {
    if (position?.averagePositionPrice) {
      store.setStatus(STATUS_IDLE)
      clearInterval(positionUpdateInterval);
    }
  } else if (store.status === STATUS_SELLING) {
    if (!position) {
      store.setStatus(STATUS_IDLE)
      clearInterval(positionUpdateInterval);
    }
  }
})

reaction(() => store.lots, async (lots) => {
  logger.debug('Lots available:', lots)
})
// reaction(() => store.positionPrice, async (price) => {
//   logger.debug('Position price:', price)
// })
reaction(() => store.buyPrice, async (price) => {
  logger.debug(`Buy price is: ${price} ${currency}`)
})
reaction(() => store.noProfitPrice, async (price) => {
  logger.debug(`No profit price is: ${price} ${currency}`)
})
reaction(() => store.takePrice, async (price) => {
  logger.debug(`Take price is: ${price} ${currency} | +${fmtNumber(takeLimit * 100)}%`)
})
reaction(() => store.stopPrice, async (price) => {
  logger.debug(`Stop price is: ${price} ${currency} | -${fmtNumber(stopLimit * 100)}%`)
})
// reaction(() => store.prevCandle, async (candle) => {
//   logger.debug('prevCandle changed', JSON.stringify(candle))
// })

async function onCandleInitialized(candle: CandleStreamingMacd) {
  const { positions } = await api.portfolio();
  const position = positions.find((el) => el.figi === figi);
  store.setPosition(position)
  // if (position) {
    // logger.info(`There is an open position of ${position.lots} lots, terminating`)
    // process.exit()
  // }

  logger.info('Started at', candle.time)
}

async function onCandleUpdated(candle: CandleStreamingMacd, prevCandle: CandleStreamingMacd) {
  const { isIdle } = store

  // const { macd } = candle
  // console.log(macd.MACD, macd.signal, macd.histogram)

  if (isIdle && !store.hasPosition) {
    const volume = prevCandle.v
    const vSignal = volume > 1400
    const deltaSignal = true // prevCandle.o <= prevCandle.c - 0.09
    const pSignal = prevCandle.o <= prevCandle.c && prevCandle.h < candle.o && candle.o < candle.c
    const dupSignal = store.buyTime !== candle.time

     if (vSignal && deltaSignal && pSignal && dupSignal) {
      store.setStatus(STATUS_BUYING)
      store.setBuyCandle(candle)
      try {
        await api.marketOrder({ figi, lots, operation: 'Buy' })
      } catch (err) {
        logger.error("Unable to place Buy order:", err)
        process.exit()
      }
    }
  // } else if (isIdle && store.hasPosition) { 
  //   if (candle.h >= store.takePrice || candle.c < store.stopPrice ) {
  //     store.setStatus(STATUS_SELLING)
  //     try {
  //       await api.marketOrder({ figi, lots: store.lots, operation: 'Sell' })
  //     } catch (err) {
  //       logger.error("Unable to place Sell order:", err)
  //       if (err.payload?.code === 'OrderBookException') { // TODO Types
  //         logger.debug(`Retrying...`)
  //         store.setStatus(STATUS_RETRY_SELLING)
  //       } else {
  //         process.exit()
  //       }
  //     }
  //   }
  // } else if (store.status === STATUS_RETRY_SELLING) {
  //   try {
  //     await api.marketOrder({ figi, lots: store.lots, operation: 'Sell' })
  //     store.setStatus(STATUS_SELLING)
  //   } catch (err) {
  //     logger.error("Unable to place Sell order:", err)
  //     if (err.payload?.code === 'OrderBookException') { // TODO Types
  //       logger.debug(`Retrying...`)
  //     } else {
  //       process.exit()
  //     }
  //   }
  }
}

async function onCandleChanged(candle: CandleStreamingMacd, prevCandle: CandleStreamingMacd) {
  logger.info(prevCandle.time, '->', candle.time)
}

function calculateMACD(candles: CandleStreamingMacd[]): CandleStreamingMacd[] {
  const fastPeriod = 12;
  const slowPeriod = 26;
  // const fastOffset = fastPeriod - 1;
  const slowOffset = slowPeriod - 1;
  const values = candles.map(({ c }) => c);

  const macd = MACD.calculate({
    values,
    fastPeriod,
    slowPeriod,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  return candles.map((c, i) => ({
    ...c,
    macd: macd[i - slowOffset],
  }));
}

(async function () {
  if (isProduction) logger.info("*** PRODUCTION MODE ***")
  else {
    await api.sandboxClear();
    await api.setCurrenciesBalance({ currency: 'USD', balance: 100 });

    // console.log(await api.searchOne({ ticker: 'FOLD' }))
  }

  try {
    let prevCandle: CandleStreamingMacd

    const getLastCandle = () => (candles[candles.length - 1])
    const getPrevCandle = () => (candles[candles.length - 2])

    api.candle({ figi, interval: "1min" }, async candle => {
      if (!getLastCandle()) {
        // loading history from the start of the day
        const { candles: history } = await api.candlesGet({
          figi,
          from: `${moment(candle.time).startOf("day").format(DATE_FORMAT)}T00:00:00Z`,
          to: candle.time,
          interval: '1min'
        })

        candles.push(...calculateMACD([...history, candle]))
        prevCandle = getPrevCandle()

        onCandleInitialized(getLastCandle())
        return
      }

      if (getLastCandle().time !== candle.time) {
        candles.push(candle)
        prevCandle = getPrevCandle()

        const macd = calculateMACD(candles)
        candles[candles.length - 1].macd = macd[macd.length - 1].macd

        onCandleChanged(getLastCandle(), prevCandle)
        onCandleUpdated(getLastCandle(), prevCandle) // ?
      } else {
        candles[candles.length - 1] = candle

        const macd = calculateMACD(candles)
        candles[candles.length - 1].macd = macd[macd.length - 1].macd

        onCandleUpdated(getLastCandle(), prevCandle)
      }
    });
  } catch (err) {
    logger.fatal(err);
  }
})();
