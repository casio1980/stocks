import { Candle, CandleResolution, CandleStreaming, PlacedMarketOrder, PortfolioPosition } from "@tinkoff/invest-openapi-js-sdk";
import { EMA, MACD } from "technicalindicators";
import { figiUSD, figiTWTR, DATE_FORMAT } from "./const";
import { info } from "./lib/logger";
import fs, { stat, Stats } from "fs";
import getAPI from "./lib/api";
import moment from "moment";

require("dotenv").config();

const api = getAPI();
const figi = figiTWTR;
const lots = 1


type Status = 'idle' | 'buying' | 'bought' | 'selling' | 'sold'

type State = {
  status: Status
  position?: PortfolioPosition
  price?: number
  takeProfit?: number
  stopLoss?: number
}

const isProduction = process.env.PRODUCTION === "true";

(async function () {
  if (isProduction) info("*** PRODUCTION MODE ***")
  else {
    await api.sandboxClear();
    await api.setCurrenciesBalance({ currency: 'USD', balance: 100 });

    // const test = await api.searchOne({ ticker: 'AAPL' });
  }

  try {
    let lastCandle: CandleStreaming
    const state: State = {
      status: 'idle',
      position: undefined,
      price: undefined,
      takeProfit: undefined,
      stopLoss: undefined
    }

    api.candle({ figi, interval: "1min" }, async candle => {
      if (!lastCandle) {
        lastCandle = candle
        info('none ->', candle.time)
        return
      }

      const { status } = state

      if (status === 'idle' && lastCandle.time !== candle.time) {
        // const vSignal = lastCandle.v > 10000 && lastCandle.v < 40000
        // const pSignal = lastCandle.h < candle.o
        const vSignal = true
        const pSignal = lastCandle.c < candle.o
        if (vSignal && pSignal) {
          state.status = 'buying'
          state.price = candle.c
          state.takeProfit = state.price + 1
          state.stopLoss = state.price - state.price * 0.01

          try {
            await api.marketOrder({ figi, lots, operation: 'Buy' })
            state.status = 'bought'
          } catch (err) {
            console.log("!", err);
          }          
        }

        info(lastCandle.time, '->', candle.time)
      }

      if (status === 'bought') {
        const portfolio = await api.portfolio();
        const { positions } = portfolio;
        const position = positions.find((el) => el.figi === figi);

        if (position && status === 'bought') {
          info('Bought', position)
          state.position = position
          state.status = 'selling'
        }
      }

      if (status === 'selling') {
        if (candle.c >= state.takeProfit || candle.c <= state.stopLoss) {
          await api.marketOrder({ figi, lots: state.position.lots, operation: 'Sell' })
          state.status = 'sold'
        }
      }

      if (status === 'sold') {
        const portfolio = await api.portfolio();
        const { positions } = portfolio;
        const position = positions.find((el) => el.figi === figi);

        if (!position && status === 'sold') {
          info('Sold')
          state.position = undefined
          state.price = undefined
          state.takeProfit = undefined
          state.stopLoss = undefined
          state.status = 'idle'
        }
      }

      lastCandle = candle
    });

    
    /*
    const interval: CandleResolution = "day";
    const filename = `data/stocks.json`;

    const stocks = await api.stocks();
    const result = stocks.instruments.filter(({ currency }) => (currency === 'USD')).map(({ ticker, name }) => ({ ticker, name }))
    fs.writeFileSync(filename, JSON.stringify(result), "utf8");
    */

    /*
    const portfolio = await api.portfolio();
    const { positions } = portfolio;

    const usd = positions.find((el) => el.figi === figiUSD);
    info(positions);
    */
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
