import { Candle } from "@tinkoff/invest-openapi-js-sdk";

declare type State = {
  assets: number
  money: number
  price?: number
  positionCount: number
};

declare type DecisionFuncParams = {
  state: State
  candle: Candle
  index: number
  candles: Candle[]
};

declare type Decision = {
  name: string;
  func: (params: DecisionFuncParams) => number | undefined;
};

declare type DecisionFactory = (args?: any) => Decision[];
