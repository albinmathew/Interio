/** Furnishing packages available in the app. The first is the default. */
import type { FurnishingPackage } from '@interio/core';
import { ESSENTIALS_3BHK } from './essentials3bhk';

export const PACKAGES: FurnishingPackage[] = [ESSENTIALS_3BHK];
export const DEFAULT_PACKAGE_ID = ESSENTIALS_3BHK.id;

export function getPackage(id: string | undefined): FurnishingPackage | undefined {
  return PACKAGES.find((p) => p.id === (id ?? DEFAULT_PACKAGE_ID));
}

export { ESSENTIALS_3BHK };
export { applyPackage, preferencesFor, type ApplyPackageOptions, type ApplyPackageResult, type RoomPatch, type WallPatch } from './apply';
export { checkPackage, lineKey, type PackageCheck, type PackageLine, type PackageSection } from './check';
export { ROLE_LABELS, bedroomRoles, missingBedroomRoles, roleSequence } from './roles';
