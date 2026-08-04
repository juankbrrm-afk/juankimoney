/**
 * Almacenamiento de objetos.
 *
 * Dos implementaciones tras el mismo puerto: S3 (MinIO en local, R2 o AWS en
 * producción) y disco local. El disco existe para poder ejecutar la
 * aplicación sin levantar contenedores; el resto del sistema no distingue
 * cuál está en uso.
 */

import { mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StoragePort } from './ports.js';

export interface S3Config {
  readonly endpoint?: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle?: boolean;
  /** Base pública (CDN) para servir sin firmar. */
  readonly publicUrl?: string;
}

export class S3Storage implements StoragePort {
  private readonly client: S3Client;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? false,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Uint8Array> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Objeto vacío o inexistente: ${key}`);
    return bytes;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async signedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    if (this.config.publicUrl) return `${this.config.publicUrl}/${key}`;

    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async signedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 900,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    );
    // El header debe coincidir exactamente con el firmado o S3 rechaza el PUT.
    return { url, headers: { 'content-type': contentType } };
  }
}

/**
 * Almacenamiento en disco para desarrollo sin contenedores.
 *
 * Las «URL firmadas» apuntan a una ruta de la API que sirve el archivo. No
 * es apto para producción —los workers replicados no comparten disco— y por
 * eso la configuración lo rechaza fuera de desarrollo.
 */
export class LocalDiskStorage implements StoragePort {
  constructor(
    private readonly root: string,
    private readonly baseUrl: string,
  ) {}

  private pathFor(key: string): string {
    // Se resuelve y se comprueba el prefijo para que una clave con `..` no
    // pueda escribir fuera del directorio raíz.
    const target = resolve(join(this.root, key));
    const rootResolved = resolve(this.root);
    if (!target.startsWith(rootResolved)) {
      throw new Error(`Clave de almacenamiento inválida: ${key}`);
    }
    return target;
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.pathFor(key)));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  async signedDownloadUrl(key: string): Promise<string> {
    return `${this.baseUrl}/files/${encodeURI(key)}`;
  }

  async signedUploadUrl(
    key: string,
    contentType: string,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    return {
      url: `${this.baseUrl}/files/${encodeURI(key)}`,
      headers: { 'content-type': contentType },
    };
  }
}

/** Claves de almacenamiento en un solo sitio, para que el layout sea legible. */
export const storageKeys = {
  voiceSample: (userId: string, uploadId: string, extension: string) =>
    `users/${userId}/voice-samples/${uploadId}.${extension}`,
  voiceModel: (userId: string, voiceModelId: string) =>
    `users/${userId}/voice-models/${voiceModelId}/model.bin`,
  voicePreview: (userId: string, voiceModelId: string) =>
    `users/${userId}/voice-models/${voiceModelId}/preview.mp3`,
  songArtifact: (userId: string, versionId: string, name: string) =>
    `users/${userId}/songs/${versionId}/${name}`,
  songExport: (userId: string, versionId: string, format: string) =>
    `users/${userId}/songs/${versionId}/master.${format}`,
} as const;
