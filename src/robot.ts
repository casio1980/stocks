import { Candle, CandleResolution } from "@tinkoff/invest-openapi-js-sdk";
import { EMA, MACD } from "technicalindicators";
import { figiUSD, figiTWTR, DATE_FORMAT } from "./const";
import { info } from "./lib/logger";
import fs from "fs";
import getAPI from "./lib/api";
import moment from "moment";

require("dotenv").config();

const api = getAPI();
const isProduction = process.env.PRODUCTION === "true";

const figi = figiUSD;
const interval: CandleResolution = "day";

const channel = {
  p1: { date: "2020-06-23", price: 68.55 },
  p2: { date: "2020-07-22", price: 70.59 },
  height: 2.68,
};

const calcChannel = ({ p1, p2, height }, date) => {
  const date1 = moment(p1.date);
  const date2 = moment(p2.date);
  const delta = (p2.price - p1.price) / date2.diff(date1, "days");

  const days = moment(date).diff(date1, "days");
  const l = p1.price + delta * days;
  return { l, h: l + height };
};

if (isProduction) info("*** PRODUCTION MODE ***");

(async function () {
  try {
    // const filename = `data/twtr-${interval}.json`;
    console.log();

    api.candle({ figi, interval }, (candle) => {
      const { o, c, h, l, v, time } = candle;
      // const date = moment(time).format(DATE_FORMAT);
      console.log(calcChannel(channel, "2020-07-10"));
    });

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
