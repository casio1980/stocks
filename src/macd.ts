import { Candle, CandleResolution, MarketInstrument } from "@tinkoff/invest-openapi-js-sdk";
import { State, Decision, DecisionFuncParams, DecisionFactory } from './types'
import { EMA, MACD } from "technicalindicators";
import {
  figiUSD,
  figiTWTR,
  DATE_FORMAT,
  INITIAL_MONEY,
  COMMISSION,
} from "./const";
import { info } from "./lib/logger";
import fs from "fs";
import getAPI from "./lib/api";
import { sleep, fmtNumber, isRegularMarket, loadData } from "./lib/utils";
import moment from "moment";

require("dotenv").config();

const api = getAPI();

const figiName = "twtr";
const figi = figiTWTR;

// const skip = ['VRSB']

if (process.env.PRODUCTION === "true") info("*** PRODUCTION MODE ***");

(async function () {
  try {
    info(`Downloading stocks...`);
    const { instruments: stocks } = await api.stocks()

    for (let index = 0; index < stocks.length; index++) {
      const stock = stocks[index]

      // Downloading day candles
      info(`Downloading day candles for ${stock.ticker}...`);
      const { candles: days } = await api.candlesGet({
        from: `${moment().startOf("year").format(DATE_FORMAT)}T00:00:00Z`,
        to: `${moment().add(1, "days").format(DATE_FORMAT)}T00:00:00Z`,
        figi: stock.figi,
        interval: "day",
      });
      
      // info(`Calculating metrics...`);
      const fastPeriod = 12;
      const slowPeriod = 26;
      const fastOffset = fastPeriod - 1;
      const slowOffset = slowPeriod - 1;
      const values = days.map(({ c }) => c);

      const ema = EMA.calculate({ values, period: fastPeriod });
      const macd = MACD.calculate({
        values,
        fastPeriod,
        slowPeriod,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
      });

      const result = days.map((item, i) => ({
        ...item,
        ema: ema[i - fastOffset],
        macd: macd[i - slowOffset],
      }));

      const LAST = 5
      const lastMACD = result.slice(-LAST).map(item => item?.macd)

      let localMinCount = 0
      let isMacdBeyondSignal = true
      let isHistNegative = true

      if (!lastMACD.some(item => item === undefined) && lastMACD.length === LAST) {
        for (let i = 1; i < LAST - 1; i++) {
          const prev = lastMACD[i - 1]
          const curr = lastMACD[i]
          const next = lastMACD[i + 1]

          if (prev.MACD > curr.MACD && curr.MACD < next.MACD) {
            localMinCount += 1
          }

          if (prev.MACD > prev.signal || curr.MACD > curr.signal || next.MACD > next.signal) {
            isMacdBeyondSignal = false
          }

          if (prev.histogram > 0 || curr.histogram > 0 || next.histogram > 0) {
            isHistNegative = false
          }
        }
      }

      if (localMinCount === 1 && isMacdBeyondSignal && isHistNegative) {
        info(`X ${stock.ticker}`)
      }

      await sleep(3000)
    }

    process.exit()

    // Downloading day candles
    info(`Downloading day candles for ${figiName.toUpperCase()}...`);
    const { candles: days } = await api.candlesGet({
      from: `${moment().startOf("year").format(DATE_FORMAT)}T00:00:00Z`,
      to: `${moment().add(1, "days").format(DATE_FORMAT)}T00:00:00Z`,
      figi,
      interval: "day",
    });
    
    info(`Calculating metrics...`);
    const fastPeriod = 12;
    const slowPeriod = 26;
    const fastOffset = fastPeriod - 1;
    const slowOffset = slowPeriod - 1;
    const values = days.map(({ c }) => c);

    const ema = EMA.calculate({ values, period: fastPeriod });
    const macd = MACD.calculate({
      values,
      fastPeriod,
      slowPeriod,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });

    const result = days.map((item, i) => ({
      ...item,
      ema: ema[i - fastOffset],
      macd: macd[i - slowOffset],
    }));

    // TODO combine with download.ts
    const filename = `data/${figiName.toLowerCase()}-day.json`;
    info(`Writing ${filename}...`);
    fs.writeFileSync(filename, JSON.stringify(result), "utf8");

  } catch (err) {
    info("FATAL", err);
  }
})();