// pattern: Imperative Shell

/**
 * A push/pull decoupling queue for async pipelines.
 *
 * ## Why this exists
 *
 * Pipeline stages usually consume values by pulling from an `AsyncIterable`, but
 * runtime orchestration (CLI commands, observers, handoff hooks) often wants
 * to push new values imperatively.
 *
 * This queue provides both modes over one channel:
 *
 * - **Push-side API**: `push`, `close`, `fail`, `on`
 * - **Pull-side API**: `values()` / `for await ... of queue`
 *
 * The pull stream is the normative interface. Push is an adapter used by the
 * imperative shell.
 *
 * ## Backpressure and high-water events
 *
 * `highWaterMark` is an observability threshold, not a hard blocking limit.
 * The queue emits:
 *
 * - `highWaterMark` when buffered items cross from `< hwm` to `>= hwm`
 * - `drain` when buffered items cross from `>= hwm` to `< hwm`
 *
 * This gives runtime policy hooks (`on("highWaterMark", ...)`) without forcing
 * one global backpressure policy into the queue implementation.
 */

export const BUFFERED_QUEUE_EVENT = {
  push: "push",
  shift: "shift",
  highWaterMark: "highWaterMark",
  drain: "drain",
  close: "close",
  fail: "fail",
} as const;

export type BufferedQueueEventName =
  (typeof BUFFERED_QUEUE_EVENT)[keyof typeof BUFFERED_QUEUE_EVENT];

export type BufferedQueueSnapshotShape = {
  buffered: number;
  waiting: number;
  highWaterMark: number;
  aboveHighWaterMark: boolean;
  closed: boolean;
  failed: boolean;
  consumerAttached: boolean;
};

export type BufferedQueueSnapshot = Readonly<BufferedQueueSnapshotShape>;

export type BufferedQueuePushEventShape = {
  type: "push";
  valueBuffered: boolean;
  snapshot: BufferedQueueSnapshot;
};

export type BufferedQueueShiftEventShape = {
  type: "shift";
  snapshot: BufferedQueueSnapshot;
};

export type BufferedQueueHighWaterMarkEventShape = {
  type: "highWaterMark";
  snapshot: BufferedQueueSnapshot;
};

export type BufferedQueueDrainEventShape = {
  type: "drain";
  snapshot: BufferedQueueSnapshot;
};

export type BufferedQueueCloseEventShape = {
  type: "close";
  snapshot: BufferedQueueSnapshot;
};

export type BufferedQueueFailEventShape = {
  type: "fail";
  error: Error;
  snapshot: BufferedQueueSnapshot;
};

export type BufferedQueueEventMap = {
  push: Readonly<BufferedQueuePushEventShape>;
  shift: Readonly<BufferedQueueShiftEventShape>;
  highWaterMark: Readonly<BufferedQueueHighWaterMarkEventShape>;
  drain: Readonly<BufferedQueueDrainEventShape>;
  close: Readonly<BufferedQueueCloseEventShape>;
  fail: Readonly<BufferedQueueFailEventShape>;
};

export type BufferedQueueListener<TName extends BufferedQueueEventName> = (
  event: BufferedQueueEventMap[TName],
) => void | Promise<void>;

export type BufferedAsyncQueueOptionsShape = {
  highWaterMark: number;
};

export type BufferedAsyncQueueOptions = Readonly<BufferedAsyncQueueOptionsShape>;

export type BufferedAsyncQueueShape<TItem> = {
  readonly highWaterMark: number;
  state: () => BufferedQueueSnapshot;
  push: (value: TItem) => void;
  close: () => void;
  fail: (error: Error) => void;
  on: <TName extends BufferedQueueEventName>(
    event: TName,
    listener: BufferedQueueListener<TName>,
  ) => () => void;
  values: () => AsyncIterable<TItem>;
  [Symbol.asyncIterator]: () => AsyncIterator<TItem>;
};

export type BufferedAsyncQueue<TItem> = Readonly<BufferedAsyncQueueShape<TItem>>;

type QueueWaiter<TItem> = {
  resolve: (value: IteratorResult<TItem>) => void;
  reject: (error: Error) => void;
};

function createSnapshot<TItem>(
  buffer: ReadonlyArray<TItem>,
  waiters: ReadonlyArray<QueueWaiter<TItem>>,
  highWaterMark: number,
  aboveHighWaterMark: boolean,
  closed: boolean,
  failure: Error | null,
  consumerAttached: boolean,
): BufferedQueueSnapshot {
  return {
    buffered: buffer.length,
    waiting: waiters.length,
    highWaterMark,
    aboveHighWaterMark,
    closed,
    failed: failure !== null,
    consumerAttached,
  };
}

function assertHighWaterMark(value: number): void {
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`highWaterMark must be a finite integer >= 1, got: ${value}`);
  }
}

export function createBufferedAsyncQueue<TItem>(
  options: Partial<BufferedAsyncQueueOptions> = {},
): BufferedAsyncQueue<TItem> {
  const highWaterMark = options.highWaterMark ?? 64;
  assertHighWaterMark(highWaterMark);

  const buffer: Array<TItem> = [];
  const waiters: Array<QueueWaiter<TItem>> = [];
  const listeners: {
    [event in BufferedQueueEventName]: Set<BufferedQueueListener<event>>;
  } = {
    push: new Set(),
    shift: new Set(),
    highWaterMark: new Set(),
    drain: new Set(),
    close: new Set(),
    fail: new Set(),
  };

  let closed = false;
  let failure: Error | null = null;
  let aboveHwm = false;
  let consumerAttached = false;

  function snapshot(): BufferedQueueSnapshot {
    return createSnapshot(
      buffer,
      waiters,
      highWaterMark,
      aboveHwm,
      closed,
      failure,
      consumerAttached,
    );
  }

  function emit<TName extends BufferedQueueEventName>(
    event: TName,
    payload: BufferedQueueEventMap[TName],
  ): void {
    for (const listener of listeners[event]) {
      void Promise.resolve(listener(payload));
    }
  }

  function refreshWaterLevelEvents(): void {
    const shouldBeAbove = buffer.length >= highWaterMark;
    if (!aboveHwm && shouldBeAbove) {
      aboveHwm = true;
      emit("highWaterMark", { type: "highWaterMark", snapshot: snapshot() });
      return;
    }

    if (aboveHwm && !shouldBeAbove) {
      aboveHwm = false;
      emit("drain", { type: "drain", snapshot: snapshot() });
    }
  }

  function push(value: TItem): void {
    if (closed) throw new Error("cannot push into a closed queue");
    if (failure) throw failure;

    let valueBuffered = true;
    if (waiters.length > 0) {
      const waiter = waiters.shift()!;
      waiter.resolve({ value, done: false });
      valueBuffered = false;
      emit("shift", { type: "shift", snapshot: snapshot() });
    } else {
      buffer.push(value);
      refreshWaterLevelEvents();
    }

    emit("push", {
      type: "push",
      valueBuffered,
      snapshot: snapshot(),
    });
  }

  function close(): void {
    if (closed) return;
    closed = true;

    while (waiters.length > 0) {
      const waiter = waiters.shift()!;
      waiter.resolve({ value: undefined, done: true });
    }

    emit("close", { type: "close", snapshot: snapshot() });
  }

  function fail(error: Error): void {
    if (failure) return;
    failure = error;

    while (waiters.length > 0) {
      const waiter = waiters.shift()!;
      waiter.reject(error);
    }

    emit("fail", { type: "fail", error, snapshot: snapshot() });
  }

  function on<TName extends BufferedQueueEventName>(
    event: TName,
    listener: BufferedQueueListener<TName>,
  ): () => void {
    const set = listeners[event] as Set<BufferedQueueListener<TName>>;
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  async function next(): Promise<IteratorResult<TItem>> {
    if (failure) throw failure;

    if (buffer.length > 0) {
      const value = buffer.shift()!;
      refreshWaterLevelEvents();
      emit("shift", { type: "shift", snapshot: snapshot() });
      return { value, done: false };
    }

    if (closed) return { value: undefined, done: true };

    return new Promise<IteratorResult<TItem>>((resolve, reject) => {
      waiters.push({ resolve, reject });
    });
  }

  async function* values(): AsyncGenerator<TItem> {
    if (consumerAttached) {
      throw new Error("buffered queue supports one active consumer");
    }

    consumerAttached = true;
    try {
      while (true) {
        const result = await next();
        if (result.done) return;
        yield result.value;
      }
    } finally {
      consumerAttached = false;
    }
  }

  return {
    highWaterMark,
    state: snapshot,
    push,
    close,
    fail,
    on,
    values,
    [Symbol.asyncIterator]: values,
  };
}
