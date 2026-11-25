declare namespace Deno {
  function serve(handler: (request: Request) => Response | Promise<Response>): void;
  const env: {
    get(key: string): string | undefined;
  };
}
