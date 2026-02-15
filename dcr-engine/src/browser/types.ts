export type ParsedTrace = {
  traceId: string;
  traceLabel?: string;
  events: Array<ParsedEvent>;
};

export type ParsedEvent = {
  activity: string;
  role?: string;
  timestamp?: Date;
  resource?: string;
  lifecycle?: string;
};
