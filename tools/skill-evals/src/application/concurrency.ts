/**
 * Map items with at most `limit` workers running at once. Results keep the input order. A rejected
 * worker rejects the whole call; workers are expected to turn expected failures into results.
 */
export async function mapWithConcurrency<Input, Output>(
  items: readonly Input[],
  limit: number,
  worker: (item: Input) => Promise<Output>,
): Promise<Output[]> {
  const results: Output[] = new Array(items.length);
  let nextIndex = 0;

  const runWorker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index] as Input);
    }
  };

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}
