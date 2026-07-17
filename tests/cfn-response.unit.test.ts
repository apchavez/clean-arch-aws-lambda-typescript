jest.mock("https");

import https from "https";
import { sendCfnResponse } from "../src/infra/cfn-response";

const baseEvent = {
  ResponseURL: "https://cfn.example.com/callback?sig=abc123",
  StackId: "arn:aws:cloudformation:us-east-1:111111111111:stack/my-stack/guid",
  RequestId: "req-1",
  LogicalResourceId: "MyResource",
};

type Handlers = Record<string, (...args: unknown[]) => void>;

function mockHttpsRequest({
  triggerEnd = true,
}: { triggerEnd?: boolean } = {}) {
  const resHandlers: Handlers = {};
  const res: { on: jest.Mock; resume: jest.Mock } = {
    on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
      resHandlers[event] = cb;
    }),
    resume: jest.fn(),
  };

  const reqHandlers: Handlers = {};
  const req: { on: jest.Mock; write: jest.Mock; end: jest.Mock } = {
    on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
      reqHandlers[event] = cb;
    }),
    write: jest.fn(),
    end: jest.fn(),
  };

  (https.request as unknown as jest.Mock).mockImplementation(
    (_options: unknown, callback: (res: unknown) => void) => {
      callback(res);
      if (triggerEnd) resHandlers.end();
      return req;
    }
  );

  return { req, res, reqHandlers, resHandlers };
}

describe("sendCfnResponse", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("sends a PUT request to the ResponseURL host/path with a well-formed body and resolves on 'end'", async () => {
    const { req } = mockHttpsRequest();

    await sendCfnResponse(baseEvent, "SUCCESS", "phys-1", { ok: true });

    expect(https.request).toHaveBeenCalledTimes(1);
    const [options] = (https.request as unknown as jest.Mock).mock.calls[0];
    expect(options.method).toBe("PUT");
    expect(options.hostname).toBe("cfn.example.com");
    expect(options.path).toBe("/callback?sig=abc123");

    expect(req.write).toHaveBeenCalledTimes(1);
    const sentBody = JSON.parse(req.write.mock.calls[0][0] as string);
    expect(sentBody).toEqual({
      Status: "SUCCESS",
      Reason: "success",
      PhysicalResourceId: "phys-1",
      StackId: baseEvent.StackId,
      RequestId: baseEvent.RequestId,
      LogicalResourceId: baseEvent.LogicalResourceId,
      Data: { ok: true },
    });
    expect(options.headers["content-length"]).toBe(
      Buffer.byteLength(req.write.mock.calls[0][0] as string)
    );
    expect(req.end).toHaveBeenCalledTimes(1);
  });

  test("uses data.error as the Reason when present, for a FAILED status", async () => {
    const { req } = mockHttpsRequest();

    await sendCfnResponse(baseEvent, "FAILED", "phys-1", {
      error: "something broke",
    });

    const sentBody = JSON.parse(req.write.mock.calls[0][0] as string);
    expect(sentBody.Status).toBe("FAILED");
    expect(sentBody.Reason).toBe("something broke");
  });

  test("rejects when the underlying request emits an error", async () => {
    const reqHandlers: Handlers = {};
    const req: { on: jest.Mock; write: jest.Mock; end: jest.Mock } = {
      on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
        reqHandlers[event] = cb;
      }),
      write: jest.fn(),
      end: jest.fn(),
    };
    (https.request as unknown as jest.Mock).mockImplementation(() => req);

    const promise = sendCfnResponse(baseEvent, "FAILED", "phys-1", {
      error: "boom",
    });
    reqHandlers.error(new Error("socket hang up"));

    await expect(promise).rejects.toThrow("socket hang up");
  });
});
