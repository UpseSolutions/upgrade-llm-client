import { Provider, Product } from '../core/types';
import registry from './models.json';
export type Role = keyof typeof registry.roles;
export interface ResolvedModel {
    model: string;
    provider: Provider;
}
export interface CatalogEntry {
    model: string;
    provider: string;
    measuredEngine: boolean;
}
export declare function resolveRole(role: Role, product?: Product): ResolvedModel[];
export declare function modelCatalog(): CatalogEntry[];
export declare function roles(): Role[];
export declare const REGISTRY_VERSION: number;
