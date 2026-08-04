import type { StoragePort } from '@cantara/ai';
import type { Config } from './config.js';

/**
 * Dependencias que las rutas reciben explícitamente.
 *
 * Se pasan como argumento en lugar de importarse desde un singleton para que
 * un test pueda montar la API con almacenamiento en memoria y una
 * configuración propia sin tocar variables globales.
 */
export interface AppContext {
  readonly config: Config;
  readonly storage: StoragePort;
}
