import { Candle, CandleResolution, CandleStreaming, PlacedMarketOrder, PortfolioPosition } from "@tinkoff/invest-openapi-js-sdk";
import { EMA, MACD } from "technicalindicators";
import { AvgLossInput } from "technicalindicators/declarations/Utils/AverageLoss";
import { figiUSD, figiTWTR, figiFOLD, DATE_FORMAT, STATUS_IDLE, STATUS_BUYING, STATUS_SELLING, STATUS_RETRY_SELLING } from "./const";
import { fmtNumber } from "./lib/utils";
import fs, { stat, Stats } from "fs";
import getAPI from "./lib/api";
import moment from "moment";
import log4js from "log4js";
import { Store } from "./store"
import { autorun, reaction, when } from "mobx"

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

/*
type State = {
  busy: boolean,
  position?: PortfolioPosition
  estimatedPrice: number
  lastStopLoss: number
  lastOrderTime?: string
  getAvailableLots: () => number | undefined
  getPrice: () => number | undefined
}

const state: State = {
  busy: false,
  position: undefined,
  estimatedPrice: 0,
  lastStopLoss: 0,
  lastOrderTime: undefined,
  getAvailableLots: function() { return this.position?.lots || 0 },
  getPrice: function() { return this.position ? this.position.averagePositionPrice?.value || this.estimatedPrice : undefined },
}
*/

/*
const updatePosition = async () => {
  const { positions } = await api.portfolio();

  const oldLots = state.getAvailableLots()
  const oldPrice = state.getPrice()
  state.position = positions.find((el) => el.figi === figi);

  if (state.busy && !state.position) {
    // FIXME dirty hack
    state.busy = false
  }

  if (oldLots !== state.getAvailableLots() || oldPrice !== state.getPrice()) {
    logger.info(`Position update, price: ${oldPrice} -> ${state.getPrice()}`)
    logger.debug(state.position)
    if (state.position) {
      await createTakeOrder()
    } else {
      // Cleanup
      state.estimatedPrice = 0
      state.lastStopLoss = 0
    }
  }
}
*/
/*
const cancelOrders = async () => {
  const orders = await api.orders()
  const orderIds = orders.filter(o => o.figi === figi).map(o => o.orderId)

  if (orderIds.length > 0) {
    logger.info('Cancelling old orders...')
    for (const orderId of orderIds) {
      await api.cancelOrder({ orderId })
    }
  }
}
*/
/*
const createTakeOrder = async () => {
  await cancelOrders()
  const price = fmtNumber(state.getPrice() + 0.7)
  const takeProfit = await api.limitOrder({ figi, lots: state.getAvailableLots(), operation: 'Sell', price })
  logger.info(`Created Take order @ ${price}`)
  logger.debug(takeProfit)
}
*/

reaction(() => store.status, async (status) => {
  logger.debug('Status set to:', status)

  if ([STATUS_BUYING, STATUS_SELLING].includes(status)) {
    positionUpdateInterval = setInterval(async () => {
      const { positions } = await api.portfolio();
      const position = positions.find((el) => el.figi === figi);
      store.setPosition(position)
    }, 10000)
  }
})

reaction(() => store.position, async (position) => {
  console.log('Position updated!')

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

async function onCandleInitialized(candle: CandleStreaming, candles: CandleStreaming[]) {
  // await api.candlesGet({ figi, from, interval: '1min', to: candle.time })

  const { positions } = await api.portfolio();
  const position = positions.find((el) => el.figi === figi);
  if (position) {
    logger.info(`There is an open position of ${position.lots} lots, terminating`)
    process.exit()
  }

  // setInterval(async () => {
  //   await updatePosition()
  // }, 30000)

  logger.info('Started at', candle.time)
}

async function onCandleUpdated(candle: CandleStreaming, prevCandle: CandleStreaming | undefined, candles: CandleStreaming[]) {
  if (!prevCandle) return
  const { isIdle } = store

  if (isIdle && !store.hasPosition) {
    const volume = prevCandle.v
    const vSignal = volume > 13000 // volume > 14000 // && volume < 40000
    // const vSignal = volume > 3500 && volume < 5000
    const deltaSignal = prevCandle.o <= prevCandle.c - 0.1
    const pSignal = prevCandle.h <= candle.o && candle.o < candle.c
    const dupSignal = store.buyTime !== candle.time

     if (true /*vSignal && deltaSignal && pSignal && dupSignal*/) {
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

async function onCandleChanged(candle: CandleStreaming, prevCandle: CandleStreaming, candles: CandleStreaming[]) {
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
        onCandleInitialized(candle, candles)
        return
      }

      if (getLastCandle().time !== candle.time) {
        prevCandle = getLastCandle()
        candles.push(candle)
        onCandleChanged(candle, prevCandle, candles)
        onCandleUpdated(candle, prevCandle, candles) // ?
      } else {
        candles[candles.length - 1] = candle
        onCandleUpdated(candle, prevCandle, candles)
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
