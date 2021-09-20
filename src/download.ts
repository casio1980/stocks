import { Candle } from "@tinkoff/invest-openapi-js-sdk";
import { DATE_FORMAT } from "./const";
import { info } from "./lib/logger";
import fs from "fs";
import getAPI from "./lib/api";
import moment from "moment";

require("dotenv").config();

const api = getAPI();
if (process.env.PRODUCTION === "true") info("*** PRODUCTION MODE ***");

const figiName = "twtr";

//
// DOWNLOAD ROUTINE
//

(async function () {
  try {
    // Obtaining figi
    const ticker = figiName.toUpperCase();
    const { instruments } = await api.stocks()
    const { figi } = instruments.find(item => item.ticker === ticker) || {}

    if (!figi) {
      info(`Unknown figi for ${ticker}, terminating`);
      return
    }

    // Downloading day candles
    info(`Downloading day candles for ${ticker}...`);
    const { candles: days } = await api.candlesGet({
      from: `${moment().startOf("year").format(DATE_FORMAT)}T00:00:00Z`,
      to: `${moment().add(1, "days").format(DATE_FORMAT)}T00:00:00Z`,
      figi,
      interval: "day",
    });

    const filename = `data/${figiName.toLowerCase()}-day.json`;
    info(`Writing ${filename}...`);
    fs.writeFileSync(filename, JSON.stringify(days), "utf8");
    // const candles = JSON.parse(fs.readFileSync(filename, "utf8")) as Candle[];

    const folderName = `data/${figiName.toLowerCase()}`
    if (!fs.existsSync(folderName)) {
      fs.mkdirSync(folderName)
    }

    // Downloading 1min candles
    const dates = days.map((c) => moment(c.time).format(DATE_FORMAT));
    for (const date of dates) {
      const filename = `${folderName}/${figiName.toLowerCase()}-${date}.json`;

      if (fs.existsSync(filename)) {
        const candles = JSON.parse(
          fs.readFileSync(filename, "utf8")
        ) as Candle[];
        info(`${filename}... Skipping (${candles.length} candles)`);
      } else {
        const dt = moment(date);
        const { candles: minutes } = await api.candlesGet({
          from: `${dt.format(DATE_FORMAT)}T00:00:00Z`,
          to: `${dt.add(1, "days").format(DATE_FORMAT)}T00:00:00Z`,
          figi,
          interval: "1min",
        });

        fs.writeFileSync(filename, JSON.stringify(minutes), "utf8");
        info(`${filename}... OK (${minutes.length} candles)`);
      }
    }

    info("Done.");
  } catch (err) {
    info("FATAL", err);
  }
})();
