import { CandleStreaming } from "@tinkoff/invest-openapi-js-sdk";
import { EMA, MACD } from "technicalindicators";
import { AvgLossInput } from "technicalindicators/declarations/Utils/AverageLoss";
import { figiTWTR, STATUS_IDLE, STATUS_BUYING, STATUS_SELLING, STATUS_RETRY_SELLING } from "./const";
import getAPI from "./lib/api";
import log4js from "log4js";
import { Store } from "./store"
import { reaction } from "mobx"

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
const lots = 1

let positionUpdateInterval: NodeJS.Timeout = undefined

const candles: CandleStreaming[] = []
const store = new Store(candles)

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

reaction(() => store.buyPrice, async (price) => {
  console.log('Buy price is:', price)
})
reaction(() => store.takePrice, async (price) => {
  console.log('Take price is:', price)
})
reaction(() => store.stopPrice, async (price) => {
  console.log('Stop price is:', price)
})

reaction(() => store.prevCandle, async (candle) => {
  console.log('prevCandle changed', JSON.stringify(candle))
})

async function onCandleInitialized(candle: CandleStreaming) {
  // await api.candlesGet({ figi, from, interval: '1min', to: candle.time })

  const { positions } = await api.portfolio();
  const position = positions.find((el) => el.figi === figi);
  store.setPosition(position)
  if (position) {
    logger.info(`There is an open position of ${position.lots} lots, terminating`)
    process.exit()
  }

  logger.info('Started at', candle.time)
}

async function onCandleUpdated(candle: CandleStreaming, prevCandle?: CandleStreaming) {
  if (!prevCandle) return
  const { isIdle } = store

  if (isIdle && !store.hasPosition) {
    const volume = prevCandle.v
    const vSignal = volume > 1300
    const deltaSignal = true // prevCandle.o <= prevCandle.c - 0.09
    const pSignal = prevCandle.h < candle.o && candle.o < candle.c
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
  } else if (isIdle && store.hasPosition) { 
    if (candle.h >= store.takePrice || candle.c < store.stopPrice ) {
      store.setStatus(STATUS_SELLING)
      try {
        await api.marketOrder({ figi, lots: store.lotsAvailable, operation: 'Sell' })
      } catch (err) {
        logger.error("Unable to place Sell order:", err)
        if (err.payload?.code === 'OrderBookException') { // TODO Types
          logger.debug(`Retrying...`)
          store.setStatus(STATUS_RETRY_SELLING)
        } else {
          process.exit()
        }
      }
    }
  } else if (store.status === STATUS_RETRY_SELLING) {
    try {
      await api.marketOrder({ figi, lots: store.lotsAvailable, operation: 'Sell' })
      store.setStatus(STATUS_SELLING)
    } catch (err) {
      logger.error("Unable to place Sell order:", err)
      if (err.payload?.code === 'OrderBookException') { // TODO Types
        logger.debug(`Retrying...`)
      } else {
        process.exit()
      }
    }
  }
}

async function onCandleChanged(candle: CandleStreaming, prevCandle: CandleStreaming) {
  logger.info(prevCandle.time, '->', candle.time)
}

(async function () {
  if (isProduction) logger.info("*** PRODUCTION MODE ***")
  else {
    await api.sandboxClear();
    await api.setCurrenciesBalance({ currency: 'USD', balance: 100 });

    // console.log(await api.searchOne({ ticker: 'FOLD' }))
  }

  try {
    let prevCandle: CandleStreaming

    const getLastCandle = () => (candles[candles.length - 1])

    api.candle({ figi, interval: "1min" }, async candle => {
      if (!getLastCandle()) {
        candles.push(candle)
        onCandleInitialized(candle)
        return
      }

      if (getLastCandle().time !== candle.time) {
        prevCandle = getLastCandle()
        candles.push(candle)
        onCandleChanged(candle, prevCandle)
        onCandleUpdated(candle, prevCandle) // ?
      } else {
        candles[candles.length - 1] = candle
        onCandleUpdated(candle, prevCandle)
      }
    });

    /*
    const from = `${moment().startOf("year").format(DATE_FORMAT)}T00:00:00Z`;
    const to = `${moment().add(1, "days").format(DATE_FORMAT)}T00:00:00Z`;
    const { candles } = await api.candlesGet({
      from,
      to,
      figi: figiTWTR,
      interval,
    });
    fs.writeFileSync(filename, JSON.stringify(candles), "utf8");
    */

    /*
    const twtr = JSON.parse(fs.readFileSync(filename, "utf8")) as Candle[];

    const fastPeriod = 12;
    const slowPeriod = 26;
    const fastOffset = fastPeriod - 1;
    const slowOffset = slowPeriod - 1;
    const values = twtr.map(({ c }) => c);

    const ema = EMA.calculate({ values, period: fastPeriod });
    const macd = MACD.calculate({
      values,
      fastPeriod,
      slowPeriod,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });

    const result = twtr.map((item, i) => ({
      ...item,
      ema: ema[i - fastOffset],
      macd: macd[i - slowOffset],
    }));

    console.log(">", result);
    */
  } catch (err) {
    logger.fatal(err);
  }
})();
