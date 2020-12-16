import { Candle } from "@tinkoff/invest-openapi-js-sdk";

declare type State = {
  assets: number;
  money: number;
  price?: number;
  positionCount: number;
};

declare type Decision = {
  name: string;
  func: (
    state: State,
    candle: Candle,
    index: number,
    candles: Candle[]
  ) => number | undefined;
};

declare type DecisionFactory = (args?: any) => Decision[];
