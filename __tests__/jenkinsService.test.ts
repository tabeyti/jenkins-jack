jest.mock("jenkins", () => {
  return jest.fn().mockReturnValue({ info: jest.fn() });
});
import * as jenkins from "jenkins";

import { ext } from "../src/extensionVariables";
import { JenkinsConnection } from "../src/jenkinsConnection";
import { JenkinsService } from "../src/jenkinsService";
import { Level, Logger } from "../src/logger";

describe("initialize", () => {
  let jenkinsService;
  beforeEach(async () => {
    ext.logger = new Logger(Level.Failure);

    const hostName = "test";
    const username = "user";
    const password = "secure password";
    const crumbIssuer = true;
    const folderFilter = "";

    const hostUri = "http://127.0.0.1:8080";

    let newConnection = new JenkinsConnection(
      hostName,
      hostUri,
      username,
      crumbIssuer,
      false,
      folderFilter
    );

    await newConnection.setPassword(password);

    jenkinsService = new JenkinsService(newConnection);
  });

  it("connects to jenkins instance", async () => {
    await jenkinsService.initialize();

    expect(jenkins).toBeCalledWith({
      baseUrl: "http://127.0.0.1:8080",
      crumbIssuer: true,
      headers: { Authorization: "Basic dXNlcjpzZWN1cmUgcGFzc3dvcmQ=" },
      promisify: true,
    });
  });
});
