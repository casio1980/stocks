import {
  INITIAL_MONEY,
  COMMISSION,
} from "./const";
import { info } from "./lib/logger";
// import getAPI from "./lib/api";
import { fmtNumber, isRegularMarket, loadData } from "./lib/utils";
import { Store } from "./store"
import moment from "moment"

require("dotenv").config();

// const api = getAPI();
// if (process.env.PRODUCTION === "true") info("*** PRODUCTION MODE ***");

const figiName = "twtr";
const currency = "USD";

const takeLimit = 0.09
const stopLimit = 0.059

const store = new Store();
store.setLimits({ takeLimit, stopLimit });
// store.setLimits({ takeLimit: 0.074, stopLimit: 0.013 });
// store.setLimits({ takeLimit: 0.01, stopLimit: 0.05 });

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

      const prevCandle = candles[index - 1]

      if (!store.hasPosition) {
        const buyPrice = candle.o

        // we know nothing about the candle at this point, except for candle.o
        const volume = prevCandle.v
        const vSignal = volume > 1400
        const deltaSignal = prevCandle.o <= prevCandle.c
        const pSignal = prevCandle.h < candle.o && candle.o < candle.c
        // const tSignal = isRegularMarket(candle.time)

        if (pSignal && deltaSignal && vSignal) {
          // BUY
          const lots = Math.floor(
            store.money / buyPrice / (1 + COMMISSION)
          ); // max possible amount

          const sum = fmtNumber(lots * buyPrice);
          const comm = fmtNumber(sum * COMMISSION);
          const money = fmtNumber(store.money - sum - comm)
          const avgPrice = buyPrice

          store.setBuyCandle(candle)
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
      }

      if (store.hasPosition) {
        const volume = prevCandle.v
        const vSignal = volume > 1400
        // const vSignal = true

        if (store.takePrice <= candle.h) {
          // TAKE PROFIT
          const sum = fmtNumber(store.lots * store.takePrice);
          const comm = fmtNumber(sum * COMMISSION);
          const money = fmtNumber(store.money + sum - comm)

          const delta = fmtNumber(store.takePrice - store.buyPrice)
          const duration = moment.duration(moment(candle.time).diff(store.buyTime));
          const days = fmtNumber(duration.asDays(), 0)
          console.log(takeProfitCount + 1, '>', store.buyTime, '@', store.buyPrice, '->', candle.time, '@', store.takePrice, '| TAKE', delta, 'in', days, 'days')

          store.setBuyCandle(undefined);
          store.setPosition(undefined);
          store.setMoney({ currency, value: money })
          takeProfitCount += 1
        } else if (candle.l <= store.stopPrice && vSignal) {
          // STOP LOSS
          const sum = fmtNumber(store.lots * store.stopPrice);
          const comm = fmtNumber(sum * COMMISSION);
          const money = fmtNumber(store.money + sum - comm)

          const delta = fmtNumber(store.stopPrice - store.buyPrice)
          const duration = moment.duration(moment(candle.time).diff(store.buyTime));
          const days = fmtNumber(duration.asDays(), 0)
          console.log('>', store.buyTime, '@', store.buyPrice, '->', candle.time, '@', store.takePrice, '| LOSS', delta, 'in', days, 'days')

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
          //     figi: 'test',
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