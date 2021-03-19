import { Candle, CandleResolution, CandleStreaming, PlacedMarketOrder, PortfolioPosition } from "@tinkoff/invest-openapi-js-sdk";
import { EMA, MACD } from "technicalindicators";
import { AvgLossInput } from "technicalindicators/declarations/Utils/AverageLoss";
import { figiUSD, figiTWTR, figiFOLD, DATE_FORMAT } from "./const";
import { fmtNumber } from "./lib/utils";
import fs, { stat, Stats } from "fs";
import getAPI from "./lib/api";
import moment from "moment";
import log4js from "log4js";

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
const lots = 5

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

const createTakeOrder = async () => {
  await cancelOrders()
  const price = fmtNumber(state.getPrice() + 0.7)
  const takeProfit = await api.limitOrder({ figi, lots: state.getAvailableLots(), operation: 'Sell', price })
  logger.info(`Created Take order @ ${price}`)
  logger.debug(takeProfit)
}

async function onCandleInitialized(candle: CandleStreaming, candles: CandleStreaming[]) {
  // await api.candlesGet({ figi, from, interval: '1min', to: candle.time })

  const { positions } = await api.portfolio();
  state.position = positions.find((el) => el.figi === figi);
  if (state.position) {
    logger.info(`There is an open position of ${state.position.lots} lots @ ${state.getPrice()}`)
    process.exit()
  }

  setInterval(async () => {
    await updatePosition()
  }, 30000)

  logger.info('Started at', candle.time)
}

async function onCandleUpdated(candle: CandleStreaming, prevCandle: CandleStreaming | undefined, candles: CandleStreaming[]) {
  if (!prevCandle) return
  if (state.busy) return

  if (state.getAvailableLots() === 0) {
    const volume = prevCandle.v
    const vSignal = volume > 9000 // volume > 11000 // volume > 14000 // && volume < 40000
    // const vSignal = volume > 3500 && volume < 5000
    const pSignal = prevCandle.o < prevCandle.c && candle.o < candle.c && prevCandle.h <= candle.o
    const dupSignal = state.lastOrderTime !== candle.time

    if (vSignal && pSignal && dupSignal) {
      state.estimatedPrice = candle.c

      try {
        state.busy = true
        await api.marketOrder({ figi, lots, operation: 'Buy' })
      } catch (err) {
        logger.error("Unable to place Buy order:", err)
        process.exit()
      } finally {
        state.lastOrderTime = candle.time
        state.busy = false
      }
    }
  } else if (state.getAvailableLots() > 0 && candle.c < state.lastStopLoss) {
    try {
      state.busy = true
      await cancelOrders()
      const stopLoss = await api.marketOrder({ figi, lots: state.getAvailableLots(), operation: 'Sell' })
      logger.info(`Created Stop order @ ${candle.c}`)
      logger.debug(stopLoss)
    } catch (err) {
      logger.error("Unable to place Stop order:", err)
      if (err.payload?.code === 'OrderBookException') { // TODO Types
        logger.info(`Retrying...`)
        state.busy = false
      } else {
        process.exit()
      }
    } finally {
      // state.busy = false // FIXME
    }
  }
}

async function onCandleChanged(candle: CandleStreaming, prevCandle: CandleStreaming, candles: CandleStreaming[]) {
  logger.info(prevCandle.time, '->', candle.time)

  if (state.getAvailableLots() > 0) {
    const initialStop = fmtNumber(state.getPrice() - 0.25) // 0.2

    const nCount = 32 // 25
    const nCandles = candles.slice(Math.max(candles.length - nCount - 1, 0), candles.length - 1)
    const nLow = nCandles.length === nCount ? Number(Math.min(...nCandles.map(c => c.l)).toFixed(1)) : 0

    state.lastStopLoss = Math.max(state.lastStopLoss, nLow, initialStop)
    logger.debug('Stop @', state.lastStopLoss)
  }
}

(async function () {
  if (isProduction) logger.info("*** PRODUCTION MODE ***")
  else {
    await api.sandboxClear();
    await api.setCurrenciesBalance({ currency: 'USD', balance: 100 });

    // console.log(await api.searchOne({ ticker: 'FOLD' }))
  }

  try {
    const candles: CandleStreaming[] = []
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
