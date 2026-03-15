import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
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
  private readonly endpointBaseUrl: string;

  constructor(config: OciRequiredConfig) {
    const { authProvider, region } = buildAuthProvider(config);
    this.client = new objectstorage.ObjectStorageClient({
      authenticationDetailsProvider: authProvider
    });
    this.client.region = region;
    this.namespaceName = config.namespaceName;
    this.bucketName = config.bucketName;
    this.endpointBaseUrl = this.client.endpoint.replace(/\/$/, "");
  }

  private buildParUrl(accessUri: string) {
    return `${this.endpointBaseUrl}${accessUri}`;
  }

  async headObject(objectKey: string) {
    return this.client.headObject({
      namespaceName: this.namespaceName,
      bucketName: this.bucketName,
      objectName: objectKey
    });
  }

  async createObjectWriteUrl(objectKey: string, expiresInSeconds: number) {
    const timeExpires = new Date(Date.now() + expiresInSeconds * 1000);
    const response = await this.client.createPreauthenticatedRequest({
      namespaceName: this.namespaceName,
      bucketName: this.bucketName,
      createPreauthenticatedRequestDetails: {
        name: `upload-${Date.now()}-${randomUUID()}`,
        objectName: objectKey,
        accessType:
          objectstorage.models.CreatePreauthenticatedRequestDetails.AccessType
            .ObjectWrite,
        timeExpires
      }
    });

    return {
      url: this.buildParUrl(response.preauthenticatedRequest.accessUri),
      expiresAt: timeExpires
    };
  }

  async createObjectReadUrl(objectKey: string, expiresInMinutes: number) {
    const timeExpires = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    const response = await this.client.createPreauthenticatedRequest({
      namespaceName: this.namespaceName,
      bucketName: this.bucketName,
      createPreauthenticatedRequestDetails: {
        name: `download-${Date.now()}-${randomUUID()}`,
        objectName: objectKey,
        accessType:
          objectstorage.models.CreatePreauthenticatedRequestDetails.AccessType
            .ObjectRead,
        timeExpires
      }
    });

    return {
      url: this.buildParUrl(response.preauthenticatedRequest.accessUri),
      expiresAt: timeExpires
    };
  }
}

export function createOciObjectStorageService(config: OciEnvConfig) {
  const requiredConfig = resolveRequiredConfig(config);
  if (!requiredConfig) {
    return null;
  }

  return new OciObjectStorageService(requiredConfig);
}
