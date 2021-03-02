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
    file: { type: "file", filename: "robot.log" },
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

type State = {
  busy: boolean,
  position?: PortfolioPosition
  estimatedPrice?: number
  lastOrderTime?: string
  reservedLots: number
  getAvailableLots: () => number | undefined
  getPrice: () => number | undefined
  getTake: () => number | undefined
  getStop: () => number | undefined
}

const state: State = {
  busy: false,
  position: undefined,
  estimatedPrice: undefined,
  lastOrderTime: undefined,
  reservedLots: 0,
  getAvailableLots: function() { return (this.position?.lots || 0) - this.reservedLots },
  getPrice: function() { return this.position?.averagePositionPrice?.value || this.estimatedPrice },
  getTake: function() { return fmtNumber(this.getPrice() + 0.6) },
  getStop: function() { return fmtNumber(this.getPrice() - 0.4) }
}

const updatePosition = async () => {
  const { positions } = await api.portfolio();

  const oldLots = state.getAvailableLots()
  const oldPrice = state.getPrice()
  state.position = positions.find((el) => el.figi === figi);

  if (oldLots !== state.getAvailableLots() || oldPrice !== state.getPrice()) {
    logger.info(`Position update, price: ${oldPrice} -> ${state.getPrice()}`)
    logger.debug(state.position)
    if (state.position) {
      await createTakeOrder()
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
  const takeProfit = await api.limitOrder({ figi, lots: state.getAvailableLots(), operation: 'Sell', price: state.getTake() })
  logger.info(`Created Take order @ ${state.getTake()}:`, takeProfit)
}

const waitForAveragePositionPrice = () => {}

async function onCandleInitialized(candle: CandleStreaming, candles: CandleStreaming[]) {
  // await api.candlesGet({ figi, from, interval: '1min', to: candle.time })

  const { positions } = await api.portfolio();
  state.position = positions.find((el) => el.figi === figi);
  if (state.position) {
    logger.info(`There is an open position of ${state.position.lots} lots @ ${state.getPrice()}`)
    process.exit()
    // state.reservedLots = state.position.lots
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
    const volume = prevCandle.v + candle.v
    const vSignal = volume > 10000 && volume < 40000
    const pSignal = prevCandle.o < prevCandle.c && candle.o < candle.c && prevCandle.h <= candle.o // && prevCandle.h === prevCandle.c
    const dupSignal = state.lastOrderTime !== candle.time

    if (vSignal && pSignal && dupSignal) {
      state.estimatedPrice = candle.c
      // logger.debug("prevCandle:", prevCandle)
      // logger.debug("Candle:", candle)

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
  } else if (state.getAvailableLots() > 0 && candle.c <= state.getStop()) {
    try {
      state.busy = true
      await cancelOrders()
      const stopLoss = await api.marketOrder({ figi, lots: state.getAvailableLots(), operation: 'Sell' })
      logger.info(`Created Stop order @ ${candle.c}:`, stopLoss)
    } catch (err) {
      logger.error("Unable to place Stop order:", err)
      process.exit()
    } finally {
      state.busy = false
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
