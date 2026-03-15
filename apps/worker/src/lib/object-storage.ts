import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { Readable } from "node:stream";
import * as common from "oci-common";
import * as objectstorage from "oci-objectstorage";

type OciRequiredConfig = {
  privateKeyPath: string;
  tenancyOcid: string;
  userOcid: string;
  fingerprint: string;
  region: string;
  namespaceName: string;
  bucketName: string;
};

export type OciEnvConfig = {
  OCI_PRIVATE_KEY_PATH?: string;
  OCI_TENANCY_OCID?: string;
  OCI_USER_OCID?: string;
  OCI_FINGERPRINT?: string;
  OCI_REGION?: string;
  OCI_NAMESPACE?: string;
  OCI_BUCKET?: string;
};

function trimOrUndefined(value?: string) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function hasAnyOciConfig(config: OciEnvConfig) {
  return Boolean(
    trimOrUndefined(config.OCI_PRIVATE_KEY_PATH) ||
      trimOrUndefined(config.OCI_TENANCY_OCID) ||
      trimOrUndefined(config.OCI_USER_OCID) ||
      trimOrUndefined(config.OCI_FINGERPRINT) ||
      trimOrUndefined(config.OCI_REGION) ||
      trimOrUndefined(config.OCI_NAMESPACE) ||
      trimOrUndefined(config.OCI_BUCKET)
  );
}

function resolveRequiredConfig(config: OciEnvConfig): OciRequiredConfig | null {
  const required = {
    privateKeyPath: trimOrUndefined(config.OCI_PRIVATE_KEY_PATH),
    tenancyOcid: trimOrUndefined(config.OCI_TENANCY_OCID),
    userOcid: trimOrUndefined(config.OCI_USER_OCID),
    fingerprint: trimOrUndefined(config.OCI_FINGERPRINT),
    region: trimOrUndefined(config.OCI_REGION),
    namespaceName: trimOrUndefined(config.OCI_NAMESPACE),
    bucketName: trimOrUndefined(config.OCI_BUCKET)
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length === 7) {
    return null;
  }

  if (missing.length > 0) {
    throw new Error(
      `OCI Object Storage config is incomplete. Missing fields: ${missing.join(", ")}`
    );
  }

  return required as OciRequiredConfig;
}

function resolvePrivateKeyPath(privateKeyPath: string) {
  const absolutePath = resolve(privateKeyPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`OCI private key path not found at '${absolutePath}'.`);
  }

  const stats = lstatSync(absolutePath);
  if (stats.isFile()) {
    return absolutePath;
  }

  if (!stats.isDirectory()) {
    throw new Error(
      `OCI private key path '${absolutePath}' must be a .pem file or directory.`
    );
  }

  const privatePemCandidates = readdirSync(absolutePath)
    .filter((name) => extname(name).toLowerCase() === ".pem")
    .filter((name) => !name.toLowerCase().endsWith("_public.pem"))
    .map((name) => ({
      name,
      fullPath: resolve(absolutePath, name),
      mtimeMs: statSync(resolve(absolutePath, name)).mtimeMs
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));

  if (privatePemCandidates.length === 0) {
    throw new Error(
      `No private .pem file found in '${absolutePath}'. Expected a file like '*_private.pem' or similar (excluding '*_public.pem').`
    );
  }

  return privatePemCandidates[0].fullPath;
}

function buildAuthProvider(config: OciRequiredConfig) {
  const resolvedPrivateKeyPath = resolvePrivateKeyPath(config.privateKeyPath);
  const privateKey = readFileSync(resolvedPrivateKeyPath, "utf8");
  const region = common.Region.fromRegionId(config.region);

  return {
    authProvider: new common.SimpleAuthenticationDetailsProvider(
      config.tenancyOcid,
      config.userOcid,
      config.fingerprint,
      privateKey,
      null,
      region
    ),
    region
  };
}

export class OciObjectStorageService {
  private readonly client: objectstorage.ObjectStorageClient;
  private readonly namespaceName: string;
  private readonly bucketName: string;

  constructor(config: OciRequiredConfig) {
    const { authProvider, region } = buildAuthProvider(config);
    this.client = new objectstorage.ObjectStorageClient({
      authenticationDetailsProvider: authProvider
    });
    this.client.region = region;
    this.namespaceName = config.namespaceName;
    this.bucketName = config.bucketName;
  }

  async headObject(objectKey: string) {
    return this.client.headObject({
      namespaceName: this.namespaceName,
      bucketName: this.bucketName,
      objectName: objectKey
    });
  }

  async putObject(
    objectKey: string,
    content: string | Buffer,
    contentType: string
  ) {
    const body = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    return this.client.putObject({
      namespaceName: this.namespaceName,
      bucketName: this.bucketName,
      objectName: objectKey,
      putObjectBody: body,
      contentLength: body.byteLength,
      contentType
    });
  }

  async getObjectBuffer(objectKey: string): Promise<Buffer> {
    const response = await this.client.getObject({
      namespaceName: this.namespaceName,
      bucketName: this.bucketName,
      objectName: objectKey
    });

    const body = response.value as unknown;
    if (!body) {
      throw new Error(`OCI getObject returned an empty body for '${objectKey}'.`);
    }

    if (Buffer.isBuffer(body)) {
      return body;
    }

    if (body instanceof Uint8Array) {
      return Buffer.from(body);
    }

    if (body instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        if (Buffer.isBuffer(chunk)) {
          chunks.push(chunk);
        } else {
          chunks.push(Buffer.from(chunk as ArrayBuffer));
        }
      }
      return Buffer.concat(chunks);
    }

    if (typeof body === "object" && body !== null) {
      const candidate = body as {
        transformToByteArray?: () => Promise<Uint8Array>;
        arrayBuffer?: () => Promise<ArrayBuffer>;
      };
      if (typeof candidate.transformToByteArray === "function") {
        const bytes = await candidate.transformToByteArray();
        return Buffer.from(bytes);
      }
      if (typeof candidate.arrayBuffer === "function") {
        const arrayBuffer = await candidate.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
    }

    throw new Error(
      `Unsupported OCI getObject response type for '${objectKey}'.`
    );
  }
}

export function createOciObjectStorageService(config: OciEnvConfig) {
  const requiredConfig = resolveRequiredConfig(config);
  if (!requiredConfig) {
    return null;
  }

  return new OciObjectStorageService(requiredConfig);
}
