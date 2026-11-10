export { geometryFromMesh } from './geometry';
export { LevelMeshes, type LevelMeshesProps } from './LevelMeshes';
export { ItemObject, ItemsLayer, type ItemAppearance, type ItemObjectProps, type ItemsLayerProps } from './ItemsLayer';
export { PlanScene, type PlanSceneProps } from './PlanScene';
export { SceneLighting, DEFAULT_ENVIRONMENT_URL, type SceneLightingProps } from './SceneLighting';
export {
  DEFAULT_LIGHTING_PRESET,
  LIGHTING_LABELS,
  LIGHTING_PRESETS,
  LIGHTING_SETTING,
  MAX_INTERIOR_LIGHTS,
  interiorLights,
  lampKind,
  lightSlots,
  lightingFromSettings,
  lightingRig,
  resolveLightingPreset,
  type InteriorLightOptions,
  type LightingMode,
  type LightingPreset,
  type LightingRig,
  type PointLightSpec,
} from './lighting';
export { ContactShade, OpeningsLayer, RailingsLayer, SkirtingLayer, type OpeningsLayerProps } from './Joinery';
export { contactShading, type ContactShading, type ShadeQuad } from './shading';
export { applyFit, fitModel, rotateBoundsY, type Bounds, type ModelFit } from './fit';
export { createSurfaceMaterial, setTextureBaseUrl, type SurfaceFallback } from './materials';
export { SURFACE_TEXTURES, textureSpecFor, tintToward, type TextureSpec } from './materialSpecs';
export { DOOR_OPEN_DEG, doorLeafAngle, openingParts, railingParts, skirtingBoxes, type BoxSpec, type OpeningParts } from './parts';
export { isFaded, wallHidesRoom, type FadeWall } from './wallFade';
