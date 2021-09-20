import {
  INITIAL_MONEY,
  COMMISSION,
} from "./const";
import { info } from "./lib/logger";
// import getAPI from "./lib/api";
import { fmtNumber, isRegularMarket, loadData } from "./lib/utils";
import { Store } from "./store"

require("dotenv").config();

// const api = getAPI();
// if (process.env.PRODUCTION === "true") info("*** PRODUCTION MODE ***");

const figiName = "twtr";
const currency = "USD";

type Strategy = {
  takeLimit: number
  stopLimit: number
}

// const q = [...Array(100).keys()]

// const takes = q.map(item => 1 - item * 0.01)

// const takes = [0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01]
// const stops = [0.25, 0.2, 0.15, 0.1, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01]

// const takes = [0.3, 0.25, 0.2, 0.15, 0.1, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01]
// const stops = [0.25, 0.2, 0.15, 0.1, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01]

// const takes = [0.07, 0.65, 0.06, 0.055, 0.05, 0.045, 0.04, 0.035, 0.03, 0.025, 0.02, 0.015, 0.01]
// const stops = [0.06, 0.05, 0.04, 0.03, 0.02, 0.01]

// MOMO
// const takes = [0.035]
// const stops = [0.02]

// TWTR
const takes = [0.09]
const stops = [0.059]
// const stops = [0.05]

// const strategies: Strategy[] = takes.map(item => ({ takeLimit: item, stopLimit: 0.013 }))
const strategies: Strategy[] = []

takes.forEach((takeLimit) => {
  stops.forEach((stopLimit) => {
    if (takeLimit > stopLimit) strategies.push({ takeLimit, stopLimit })
  })
})

// const strategies: Strategy[] = [
//   { takeLimit: 0.074, stopLimit: 0.011 },
//   { takeLimit: 0.074, stopLimit: 0.012 },
//   { takeLimit: 0.074, stopLimit: 0.013 },
//   { takeLimit: 0.074, stopLimit: 0.014 },
//   { takeLimit: 0.074, stopLimit: 0.015 }
// ];

function buyAt(store: Store, lots: number, price: number) {
  const sum = fmtNumber(lots * price);
  const comm = fmtNumber(sum * COMMISSION);
  const money = fmtNumber(store.money - sum - comm)
  const avgPrice = price

  // store.setBuyCandle(candle)
  store.setPosition({
    figi: 'test',
    name: figiName,
    instrumentType: "Stock",
    lots,
    balance: lots,
    averagePositionPrice: { currency, value: avgPrice }
  })
  store.setMoney({ currency, value: money })
}

function sellAt(store: Store, price: number) {
  const sum = fmtNumber(store.lots * price);
  const comm = fmtNumber(sum * COMMISSION);
  const money = fmtNumber(store.money + sum - comm)

  // console.log('>', store.buyTime, '@', store.buyPrice, '->', candle.time, '@', store.takePrice)

  store.setBuyCandle(undefined);
  store.setPosition(undefined);
  store.setMoney({ currency, value: money })
}

//
// FIND BEST STRATEGY ROUTINE
//
(async function () {
  try {
    info(`Loading candles for ${figiName.toUpperCase()}...`);
    const data = loadData(figiName)
    info(`Loaded ${data.length} candles, processing...`);

    info("Results:");
    strategies.forEach((strategy) => {
      const { takeLimit, stopLimit } = strategy

      const store = new Store();
      store.setMoney({ currency, value: INITIAL_MONEY })
      // store.setLimits({ takeLimit: 0.074, stopLimit: 0.013 });
      store.setLimits(strategy);

      let takeProfitCount = 0
      let stopLossCount = 0

      data.forEach((candle, index, candles) => {
        if (index === 0) return

        const prevCandle = candles[index - 1]
  
        if (!store.hasPosition) {
          const buyPrice = candle.o
  
          // we know nothing about the candle at this point, except for candle.o
          const volume = prevCandle.v
          const vSignal = volume > 1300
          const deltaSignal = true
          const pSignal = prevCandle.h < candle.o && candle.o < candle.c
          const tSignal = isRegularMarket(candle.time)
  
          if (pSignal && deltaSignal && vSignal) {
            // BUY
            const lots = Math.floor(
              store.money / buyPrice / (1 + COMMISSION)
            ); // max possible amount
  
            buyAt(store, lots, buyPrice)
          }
        }
  
        if (store.hasPosition) {
          // const volume = prevCandle.v
          // const vSignal = volume > 1300
  
          if (store.takePrice <= candle.h) {
            // TAKE PROFIT
            sellAt(store, store.takePrice)
            takeProfitCount += 1
          } else if (candle.l <= store.stopPrice) {
            // STOP LOSS
            sellAt(store, store.stopPrice)
            stopLossCount += 1
          }
        }
      })
  
      // reverting the last transaction
      if (store.hasPosition) {
        const sum = fmtNumber(store.lots * store.buyPrice);
        const comm = fmtNumber(sum * COMMISSION);
        const money = fmtNumber(store.money + sum + comm) // revert comm also
  
        store.setPosition(undefined);
        store.setMoney({ currency, value: money })
      }
  
      info(`${store.money} ${store.moneyAmount.currency}, profits: ${takeProfitCount}, losses: ${stopLossCount}`, strategy)
    })

  } catch (err) {
    info("FATAL", err);
  }
})();