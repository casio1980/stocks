import { Candle, CandleResolution } from "@tinkoff/invest-openapi-js-sdk";
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
import moment from "moment";

require("dotenv").config();

const api = getAPI();

const fmtNumber = (num: number) => +num.toFixed(2);

const isRegularMarket = (date: string) => {
  const d = new Date(date);
  return d.getHours() * 60 + d.getMinutes() >= 17 * 60 + 30;
};
const isClosingMarket = (date: string) => {
  const d = new Date(date);
  return d.getHours() * 60 + d.getMinutes() >= 23 * 60 + 30;
};

const figiNAME = "twtr";
const figi = figiTWTR;

let state: State;

const channel = {
  p1: { date: "2020-06-23", price: 68.55 },
  p2: { date: "2020-07-22", price: 70.59 },
  height: 2.68,
};

// const calcChannel = ({ p1, p2, height }, date) => {
//   const date1 = moment(p1.date);
//   const date2 = moment(p2.date);
//   const delta = (p2.price - p1.price) / date2.diff(date1, "days");

//   const days = moment(date).diff(date1, "days");
//   const l = p1.price + delta * days;
//   return { l, h: l + height };
// };

if (process.env.PRODUCTION === "true") info("*** PRODUCTION MODE ***");

/*
(async function () {
  try {
    // api.candle({ figi, interval }, (candle) => {
    //   const { o, c, h, l, v, time } = candle;
    //   // const date = moment(time).format(DATE_FORMAT);
    //   info(calcChannel(channel, "2020-07-10"));
    // });

    /*
    const portfolio = await api.portfolio();
    const { positions } = portfolio;

    const usd = positions.find((el) => el.figi === figiUSD);
    info(positions);
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

    info(">", result);
  } catch (err) {
    info("FATAL", err);
  }
})();
*/

//
// FIND BEST STRATEGY ROUTINE
//
(async function () {
  const simpleBuyFactory: DecisionFactory = () => [
    // {
    //   name: "Buy when OPEN > CLOSE",
    //   func: ({ state, candle, index, candles }) => {
    //     const { assets } = state;
    //     const { o: price } = candle;
    //     if (assets === 0 && index > 0 && price > candles[index - 1].c) {
    //       return price;
    //     }
    //   },
    // },
    {
      name: "Buy when OPEN >>> CLOSE",
      func: ({ state, candle, index, candles }) => {
        const { assets } = state;
        const { o: price } = candle;
        if (assets === 0 && index > 0 && price > candles[index - 1].c + 0.01) {
          return price;
        }
      },
    },    
    // {
    //   name: "Buy when OPEN > HIGH",
    //   func: (
    //     state: State,
    //     candle: Candle,
    //     index: number,
    //     candles: Candle[]
    //   ) => {
    //     const { assets } = state;
    //     const { o: price } = candle;
    //     if (assets === 0 && index > 0 && price > candles[index - 1].h) {
    //       return price;
    //     }
    //   },
    // },
  ];

  const regularMarketBuy: Decision = {
    name: "Buy on Regular market",
    func: ({ state, candle }) => {
      const { assets } = state;
      const { time, o: price } = candle;
      if (assets === 0 && isRegularMarket(time)) {
        return price;
      }
    },
  };

  const takeProfitSellFactory: DecisionFactory = (profits: number[]) =>
    profits.map((profit) => {
      return {
        name: `Sell when PROFIT = ${profit}`,
        func: ({ state, candle }) => {
          const { assets } = state;
          if (assets > 0 && candle.h >= state.price * profit) {
            return state.price * profit;
          }
        },
      };
    });

  // const marketCloseSell: Decision = {
  //   name: "Sell at market close",
  //   func: ({ state, candle }) => {
  //     const { assets } = state;
  //     const { time, o: price } = candle;
  //     if (assets > 0 && isClosingMarket(time)) {
  //       return price;
  //     }
  //   },
  // };

  const buyStrategies = [...simpleBuyFactory(), regularMarketBuy]
    .map((s, index, arr) => {
      return [
        s,
        arr
          .filter((item) => item !== s)
          .map((item) => ({
            name: `${s.name} && ${item.name}`,
            func: (params: DecisionFuncParams) =>
              s.func(params) && item.func(params),
          })),
      ].flat();
    })
    .flat();
  // const sellStrategies = [
  //   ...takeProfitSellFactory([1 + COMMISSION * 2]),
  //   marketCloseSell,
  // ];

  // const buyStrategies = [regularMarketBuy];
  const sellStrategies = [
    ...takeProfitSellFactory([
      1 + COMMISSION * 3,
      1 + COMMISSION * 4,
      1 + COMMISSION * 5,
      1 + COMMISSION * 6,
      1 + COMMISSION * 7,
      1 + COMMISSION * 8,
      1 + COMMISSION * 9,
      1 + COMMISSION * 10,
      1 + COMMISSION * 11,
      1 + COMMISSION * 12,
      1 + COMMISSION * 13,
      1 + COMMISSION * 14,
      1 + COMMISSION * 15,
      1 + COMMISSION * 16,
      1 + COMMISSION * 17,
      1 + COMMISSION * 18,
      1 + COMMISSION * 19,
      1 + COMMISSION * 20,
      1 + COMMISSION * 21,
      1 + COMMISSION * 22,
      1 + COMMISSION * 23,
      1 + COMMISSION * 24,
      1 + COMMISSION * 25,
    ]),
  ];

  const strategies = buyStrategies
    .map((buy) => sellStrategies.map((sell) => ({ buy, sell })))
    .flat();

  try {
    info(`Loading candles for ${figiNAME.toUpperCase()}...`);

    const dataFolder = `data/${figiNAME}`;
    const dataFiles = fs.readdirSync(dataFolder);
    const data = dataFiles
      .map((fileName) =>
        JSON.parse(fs.readFileSync(`${dataFolder}/${fileName}`, "utf8"))
      )
      .flat() as Candle[];

    info(`Loaded ${data.length} candles, processing...`);

    const results = strategies
      .map(({ buy, sell }) => {
        state = {
          assets: 0,
          money: INITIAL_MONEY,
          positionCount: 0,
        };

        data.forEach((candle, index, candles) => {
          const buyPrice = buy.func({ state, candle, index, candles });
          const sellPrice = sell.func({ state, candle, index, candles });

          if (buyPrice) {
            const assets = Math.floor(
              state.money / buyPrice / (1 + COMMISSION)
            ); // max possible amount
            const sum = fmtNumber(assets * buyPrice);
            const comm = fmtNumber(sum * COMMISSION);

            state = {
              ...state,
              assets,
              money: fmtNumber(state.money - sum - comm),
              price: buyPrice,
            };
          }
          if (sellPrice) {
            const sum = fmtNumber(state.assets * sellPrice);
            const comm = fmtNumber(sum * COMMISSION);

            state = {
              ...state,
              assets: 0,
              money: fmtNumber(state.money + sum - comm),
              price: undefined,
              positionCount: state.positionCount + 1,
            };
          }
        });

        // reverting the last transaction
        if (state.assets) {
          const sum = fmtNumber(state.assets * state.price);
          const comm = fmtNumber(sum * COMMISSION);

          state = {
            ...state,
            assets: 0,
            money: fmtNumber(state.money + sum + comm),
            price: undefined,
          };
        }

        return {
          money: state.money,
          buy: buy.name,
          sell: sell.name,
          positionCount: state.positionCount,
        };
      })
      .sort((a, b) => b.money - a.money)
      .slice(0, 15);

    info("Results:");

    results.forEach((result) => {
      info(result);
    });
  } catch (err) {
    info("FATAL", err);
  }
})();