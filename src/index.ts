import { Candle, CandleResolution, CandleStreaming, PlacedMarketOrder, PortfolioPosition } from "@tinkoff/invest-openapi-js-sdk";
import { EMA, MACD } from "technicalindicators";
import { figiUSD, figiTWTR, figiFOLD, DATE_FORMAT } from "./const";
import { info } from "./lib/logger";
import { fmtNumber } from "./lib/utils";
import fs, { stat, Stats } from "fs";
import getAPI from "./lib/api";
import moment from "moment";
import { AvgLossInput } from "technicalindicators/declarations/Utils/AverageLoss";

require("dotenv").config();

const isProduction = process.env.PRODUCTION === "true";

const api = getAPI();
const figi = figiTWTR;
const lots = 1

type State = {
  busy: boolean,
  position?: PortfolioPosition
  estimatedPrice?: number
  lastOrderTime?: string,
  getPrice: () => number | undefined
  getTake: () => number | undefined
  getStop: () => number | undefined
}

const state: State = {
  busy: false,
  position: undefined,
  estimatedPrice: undefined,
  lastOrderTime: undefined,
  getPrice: function() { return this.position?.averagePositionPrice?.value || this.estimatedPrice },
  getTake: function() { return fmtNumber(this.getPrice() + 0.6) },
  getStop: function() { return fmtNumber(this.getPrice() - 0.4) }
}

const updatePosition = async () => {
  const { positions } = await api.portfolio();

  const oldPosition = state.position
  const oldPrice = state.getPrice()
  state.position = positions.find((el) => el.figi === figi);

  if (!isEqual(oldPosition, state.position) || oldPrice !== state.getPrice()) {
    info(`Position update, price: ${oldPrice} -> ${state.getPrice()}`)

    if (state.position) {
      await createTakeOrder()
    }
  // } else {
  //   info('>', state.position)
  }
}

const createTakeOrder = async () => {
  const orders = await api.orders()
  const orderIds = orders.filter(o => o.figi === figi).map(o => o.orderId)

  if (orderIds.length > 0) {
    info('Cancelling old orders...')
    for (const orderId of orderIds) {
      await api.cancelOrder({ orderId })
    }
  }

  const takeProfit = await api.limitOrder({ figi, lots: state.position.lots, operation: 'Sell', price: state.getTake() })
  info('Created Take order:', takeProfit)
}

const waitForAveragePositionPrice = () => {}

async function onCandleInitialized(candle: CandleStreaming, candles: CandleStreaming[]) {
  info('Started at', candle.time)
  // await api.candlesGet({ figi, from, interval: '1min', to: candle.time })

  await updatePosition()
  setInterval(async () => {
    await updatePosition()
  }, 30000)

  if (state.position) {
    await createTakeOrder()
  }
}

async function onCandleUpdated(candle: CandleStreaming, prevCandle: CandleStreaming | undefined, candles: CandleStreaming[]) {
  if (!prevCandle) return
  if (state.busy) return

  if (!state.position) {
    const volume = prevCandle.v + candle.v
    const vSignal = volume > 10000 && volume < 40000
    const pSignal = prevCandle.c > prevCandle.o && prevCandle.c <= candle.o // h
    const dupSignal = state.lastOrderTime !== candle.time

    if (vSignal && pSignal && dupSignal) {
      state.estimatedPrice = candle.c

      try {
        state.busy = true
        await api.marketOrder({ figi, lots, operation: 'Buy' })
        // await updatePosition()
        // await createTakeOrder()
      } catch (err) {
        console.log("Unable to place Buy order:", err)
        process.exit()
      } finally {
        state.lastOrderTime = candle.time
        state.busy = false
      }
    }
  } else {
    // Stop loss - BE CAREFUL
    if (candle.c < state.getStop()) {
      try {
        state.busy = true
        const stopLoss = await api.marketOrder({ figi, lots: state.position.lots, operation: 'Sell' })
        info('Created Stop order:', stopLoss)
        // await updatePosition()
      } catch (err) {
        console.log("Unable to place Sell order:", err)
        process.exit()
      } finally {
        state.busy = false
      }
    }
  }
}

async function onCandleChanged(candle: CandleStreaming, prevCandle: CandleStreaming, candles: CandleStreaming[]) {
  info(prevCandle.time, '->', candle.time)
}

(async function () {
  if (isProduction) info("*** PRODUCTION MODE ***")
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
    info("FATAL", err);
  }
})();
