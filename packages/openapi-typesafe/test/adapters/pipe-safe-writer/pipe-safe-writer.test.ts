import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createPipeSafeWriter } from "../../../src/adapters/pipe-safe-writer/pipe-safe-writer.js";

/** A stream whose writes fail with the code once `failWith` is set, like a closed pipe. */
function failingStream() {
  const written: string[] = [];
  const state: { failWith?: string } = {};
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (state.failWith === undefined) {
        written.push(chunk.toString());
        callback();
        return;
      }
      callback(Object.assign(new Error(`write ${state.failWith}`), { code: state.failWith }));
    },
  });
  return { stream, written, state };
}

const settled = () => new Promise((resolve) => setImmediate(resolve));

describe("createPipeSafeWriter", () => {
  it("createPipeSafeWriter writes the text to the stream", async () => {
    const { stream, written } = failingStream();
    const write = createPipeSafeWriter(stream);

    write("types");
    await settled();

    expect(written).toEqual(["types"]);
  });

  it("createPipeSafeWriter with a closed pipe stops writing without an error", async () => {
    const { stream, written, state } = failingStream();
    const write = createPipeSafeWriter(stream);
    state.failWith = "EPIPE";

    write("first");
    await settled();
    write("second");
    await settled();

    expect(written).toEqual([]);
  });

  it("createPipeSafeWriter throws another write error again", () => {
    const { stream } = failingStream();
    createPipeSafeWriter(stream);
    const error = Object.assign(new Error("write ENOSPC"), { code: "ENOSPC" });

    expect(() => stream.emit("error", error)).toThrow(error);
  });
});
