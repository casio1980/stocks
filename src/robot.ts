import {
  figiTWTR,
  INITIAL_MONEY,
  COMMISSION,
} from "./const";
import { info } from "./lib/logger";
import getAPI from "./lib/api";
import { fmtNumber, isRegularMarket, loadData } from "./lib/utils";
import { Store } from "./store"

require("dotenv").config();

const api = getAPI();

const currency = "USD";
const figiName = "twtr";
const figi = figiTWTR;

const store = new Store()

if (process.env.PRODUCTION === "true") info("*** PRODUCTION MODE ***");

//
// FIND BEST STRATEGY ROUTINE
//
(async function () {
  try {
    info(`Loading candles for ${figiName.toUpperCase()}...`);
    const data = loadData(figiName)
    info(`Loaded ${data.length} candles, processing...`);

    store.setMoney({ currency, value: INITIAL_MONEY })

    let takeProfitCount = 0
    let stopLossCount = 0

    data.forEach((candle, index, candles) => {
      if (index === 0) return

      if (!store.hasPosition) {
        const prevCandle = candles[index - 1]
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
          // const lots = 1

          const sum = fmtNumber(lots * buyPrice);
          const comm = fmtNumber(sum * COMMISSION);
          const money = fmtNumber(store.money - sum - comm)
          const avgPrice = buyPrice

          store.setBuyCandle(candle)
          store.setPosition({
            figi,
            name: figiName,
            instrumentType: "Stock",
            lots,
            balance: lots,
            averagePositionPrice: { currency, value: avgPrice }
          })
          store.setMoney({ currency, value: money })
        }
      }

      if (store.hasPosition) {
        if (store.takePrice <= candle.h) {
          // TAKE PROFIT
          const sum = fmtNumber(store.lots * store.takePrice);
          const comm = fmtNumber(sum * COMMISSION);
          const money = fmtNumber(store.money + sum - comm)

          console.log('>', store.buyTime, '@', store.buyPrice, '->', candle.time, '@', store.takePrice)

          store.setBuyCandle(undefined);
          store.setPosition(undefined);
          store.setMoney({ currency, value: money })
          takeProfitCount += 1
        } else if (candle.l <= store.stopPrice) {
          // STOP LOSS
          const sum = fmtNumber(store.lots * store.stopPrice);
          const comm = fmtNumber(sum * COMMISSION);
          const money = fmtNumber(store.money + sum - comm)

          store.setBuyCandle(undefined);
          store.setPosition(undefined);
          store.setMoney({ currency, value: money })
          stopLossCount += 1

          // const lots = store.lots
          // const sum = fmtNumber(lots * store.stopPrice);
          // const comm = fmtNumber(sum * COMMISSION);
          // const money = fmtNumber(store.money - sum - comm)
          // const avgPrice = fmtNumber((store.buyPrice + store.stopPrice) / 2)

          // if (money > 0) {
          //   console.log('>', store.lots + lots, store.money, '->', money, avgPrice)

          //   store.setPosition({
          //     figi,
          //     name: figiName,
          //     instrumentType: "Stock",
          //     lots: store.lots + lots,
          //     balance: store.lots + lots,
          //     averagePositionPrice: { currency, value: avgPrice }
          //   })
          //   store.setMoney({ currency, value: money })
          // }
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

    info("Results:");
    info(`${store.money} ${store.moneyAmount.currency}, profits: ${takeProfitCount}, losses: ${stopLossCount}`)

  } catch (err) {
    info("FATAL", err);
  }
})();