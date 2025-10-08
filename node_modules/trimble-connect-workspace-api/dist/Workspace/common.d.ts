import { ModelPlacement } from "./ViewerAPI";
import { ConnectProject } from "./ProjectAPI";
/**
 * The data structure representing a color composed of RGBA components.
 */
export interface ColorRGBA {
    /** The Red component of the color [0, 255] */
    r: number;
    /** The Green component of the color [0, 255] */
    g: number;
    /** The Blue component of the color [0, 255] */
    b: number;
    /** The Alpha component of the color [0, 255] */
    a: number;
}
/** The HEX color */
export declare type HexColor = string;
/** The type of the model identifier */
export declare type ModelId = string;
/** The type of the model version identifier */
export declare type ModelVersionId = string;
/** The type of the object identifier. This is the identifier that is used to uniquely identify an object (e.g. externally in Connect).
 * @remarks Use the {@link ViewerAPI.convertToObjectRuntimeIds} to retrieve the {@link ObjectRuntimeId}.
 */
export declare type ObjectId = string;
/** The type of the object runtime identifier. The is the identifier that is used to query the object at runtime (e.g. internally in 3D Viewer).
 * @remarks Use the {@link ViewerAPI.convertToObjectIds} to retrieve the {@link ObjectId}.
 */
export declare type ObjectRuntimeId = number;
/** The type of the model state */
export declare type ModelState = "loaded" | "unloaded";
/** The 3D Vector. */
export interface Vector3 {
    /** The X-coordinate. */
    x: number;
    /** The Y-coordinate. */
    y: number;
    /** The Z-coordinate. */
    z: number;
}
/** The 2D Vector. */
export interface Vector2 {
    /** The X-coordinate. */
    x: number;
    /** The Y-coordinate. */
    y: number;
}
/** The data structure represent the 3D Box3 */
export interface Box3 {
    isBox3: boolean;
    min: Vector3;
    max: Vector3;
}
/** The data for pick event */
export interface PointPickedDetail {
    /** The position. */
    position: Vector3;
    /** The normal. */
    normal: Vector3;
    /** The normal. */
    modelId: string;
    /** The object runtime id. */
    objectRuntimeId: number;
    /** pointCloud url */
    url?: string;
}
/** In the Quaternion the identity is pointing down (negative Z) and up direction is pointing towards positive Y axis. */
export interface Quaternion {
    /** The X-coordinate. */
    x: number;
    /** The Y-coordinate. */
    y: number;
    /** The Z-coordinate. */
    z: number;
    /** The W-coordinate. */
    w: number;
}
/**
 * The data structure representing a model identifier.
 */
export interface ModelVersionIdentifier {
    /** The model identifier */
    id: ModelId;
    /** The model version identifier */
    versionId?: ModelVersionId;
}
/**
 * The data structure representing a model in Trimble Connect project ({@link ConnectProject}).
 */
export interface ModelSpec {
    /** The model identifier */
    id: ModelId;
    /** The model version identifier */
    versionId: ModelVersionId;
    /** The flag indicating if the model version is latest version. */
    isLatestVersion: boolean;
    /** The model name */
    name: string;
    /** The model state */
    state: string;
    /** The model type */
    type: string;
    /** The model placement */
    placement?: ModelPlacement;
}
/** The object property. */
export interface Property {
    /**
     * The property name.
     * This is the original property name in the model - the property names in the Trimble Connect UI are formatted differently for better readability.
     */
    name: string;
    /** The property value. */
    value: string | number;
    /** The property type. */
    type: PropertyType;
}
/** The property type. */
export declare const enum PropertyType {
    /** Value is in millimeters (`mm`) */
    LengthMeasure = 0,
    /** Value is in square meters (`m2`) */
    AreaMeasure = 1,
    /** Value is in cubic meters (`m3`) */
    VolumeMeasure = 2,
    /** Value is in kilograms (`kg`) */
    MassMeasure = 3,
    /** Value is in degrees (`°`) */
    AngleMeasure = 4,
    /** The string value type */
    StringValue = 5,
    /** The integer value type */
    IntValue = 6,
    /** The double value type */
    DoubleValue = 7,
    /** Value is a [BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt) representing a UNIX timestamp */
    DateTime = 8,
    /** Value is a Javascript boolean `true` or `false` representing a boolean TRUE or FALSE.
     *
     *  Value is a nullable, so `null` and `undefined` must also be expected. */
    Logical = 9,
    /** Value is an integer `1` or `0` reprenting a boolean TRUE or FALSE */
    Boolean = 10
}
export interface PropertyDefinition {
    /**
     * The property name.
     * This is the original property name in the model - the property names in the Trimble Connect UI are formatted differently for better readability.
     */
    name: string;
    /** The property type. */
    type: PropertyType;
}
/** The definition of a property set and its properties. */
export interface PropertySetDefinition {
    /** The property set name. */
    name: string;
    /** index corresponds to prop index in model.properties.definition.properties */
    properties: PropertyDefinition[];
}
/** The product detail. */
export interface Product {
    /** The name of the product */
    name?: string;
    /** The description of the product */
    description?: string;
    /** The object type of the product */
    objectType?: string;
}
/** The object property set. */
export interface PropertySet {
    /** The name of the property set */
    set?: string;
    /** The properties of the property set */
    properties?: Property[];
}
/**
 * The data structure representing an object entity in Trimble Connect 3D Viewer.
 */
export interface ObjectProperties {
    /** The object identifier */
    id: number;
    /** The object class */
    class?: string;
    /** The object product */
    product?: Product;
    /** The object properties */
    properties?: PropertySet[];
    /** The object color */
    color?: HexColor;
    /** The object position. The coordinates are in meters.  */
    position?: Vector3;
}
/** The data structure representing the entities belonging to a model in Trimble Connect project ({@link ConnectProject}). */
export interface ModelObjects {
    /** The model identifier */
    modelId: ModelId;
    /** The model object entities */
    objects: ObjectProperties[];
}
/** The data structure representing the object runtime IDs belonging to a model in Trimble Connect project ({@link ConnectProject}). */
export interface ModelObjectIds {
    /** The model identifier. The `modelId` equals to `File.versionId` for models stored as files in Trimble Connect. */
    modelId: ModelId;
    /** The model object runtime identifiers */
    objectRuntimeIds?: ObjectRuntimeId[];
    /** Retrieve objects recursively */
    recursive?: boolean;
}
/** The data structure representing the layers belonging to a model in Trimble Connect project ({@link ConnectProject}). */
export interface Layer {
    /** The layer name */
    name: string;
    /** The layer visibility */
    visible: boolean;
}
/** The view entity states. */
export declare const enum ViewEntityStates {
    /** The selected state. */
    Selected = 1,
    /** The hidden state. */
    Hidden = 4,
    /** The selected and hidden state. */
    SelectedHidden = 5,
    /** The visible state. */
    Visible = 6,
    /** The selected and visible state. */
    SelectedVisible = 7,
    /** The highlighted state. */
    Highlighted = 8
}
/** The data structure representing properties of panorama. */
export interface PanoramaMetadata {
    /** Unique identifier for different panoramas */
    id: string;
    /** Sets the rotation of the panorama BufferGeometry */
    headingInDegrees?: number;
    /** The top field of view is used to determine which tile to load when the camera rotates (in degrees) */
    fovTop?: number;
    /** The bottom field of view is used to determine which tile to load when the camera rotates (in degrees) */
    fovBottom?: number;
    /** The left field of view is used to calculate the bounding square of the nodes (in degrees) */
    fovLeft?: number;
    /** The right field of view is used to calculate the bounding square of the nodes (in degrees) */
    fovRight: number;
    /** The url pattern to load the tiles */
    tilesUrl: string;
    /**
     * The tile height that is used to determine the current level of detail (in pixels)
     * In case of square tiles the value of tileHeight will be considered as tileWidth
     * */
    tileHeight: number;
    /** The tile width that is used to determine the current level of detail (in pixels) */
    tileWidth?: number;
    /** Certain tiles start in the lower left corner and not top left */
    isLowerLeftOrigin: boolean;
    /** The combined width of the tiles.  This will be the calculated width so tiles fit precisely and not the original image width. (in pixels) */
    maxWidth: number;
    /**  The combined height of the tiles.  This will be the calculated height so tiles fit precisely and not the original image height. (in pixels) */
    maxHeight: number;
    /** The size of the sphere around the camera position.
     * Smaller spheres allow placement in world where larger spheres allows better blending between tiles. (in meters)
     */
    sphereRadius: number;
    /** Position in world. The coordinates are in meters. */
    position: Vector3;
    /** Minimum field of view used in level of details calculations. */
    minFov?: number;
    /** Maximum field of view used in level of details calculations. */
    maxFov?: number;
    /** The minimum lod level to start with. */
    minLodLevel?: number;
    /**
     * Adjust the lod to display levels sooner or later when zooming.
     * Lod after adjustment will be clamped [minLodLevel, maxLodLevel]
     */
    lodAdjustment?: number;
    /**
     * Sets the pitch rotation of the panorama BufferGeometry
     */
    pitchInDegrees?: number;
    /**
     * Sets the roll rotation of the panorama BufferGeometry
     */
    rollInDegrees?: number;
    /**
     * Sets the euler order for the rotation of the panorama BufferGeometry
     */
    eulerOrder?: string;
}
/** Point Color Type sets the visualization scheme used to color the points of a scan */
export declare const enum PointColorType {
    /** Original scan colors of points */
    RGB = 0,
    /** Use the height of z value of points to display topography or relief of terrain */
    ELEVATION = 3,
    /** Intensity is a measure of point reflectivity,
     * which can vary depending on color, surface texture,
     * surface angle, and the environment */
    INTENSITY = 4,
    /** Classification is a way of grouping points into categories
     * based on their characteristics, such as ground, vegetation,
     * building, water, etc */
    CLASSIFICATION = 8,
    /** This type blends the original scan colors with elevation */
    RGB_HEIGHT = 13,
    /** Combination of INTENSITY and CLASSIFICATION */
    INTENSITY_CLASSIFICATION = 14,
    /** Clearance workflow */
    CLEARANCE = 15
}
export declare type ShadingOptions = "DEFAULT" | "EYE_DOME_LIGHTING";
export interface IColor {
    /** The Red component of the color [0, 255] */
    r: number;
    /** The Green component of the color [0, 255] */
    g: number;
    /** The Blue component of the color [0, 255] */
    b: number;
}
export declare const enum PointShape {
    SQUARE = 0,
    CIRCLE = 1,
    PARABOLOID = 2
}
/** The data structure representing point clouds style setting  */
export interface IPointCloudSettings {
    /** The colors applied to each classification inside the point cloud */
    classificationColors?: IColor[];
    /** The visibility of each classification inside the point cloud */
    classificationVisibility?: boolean[];
    /** The band boundaries of the clearance workflow */
    clearanceBandBoundaries?: number[];
    /** The colors of the clearance workflow */
    clearanceBandColors?: IColor[];
    /** The default color of the clearance workflow */
    clearanceDefaultColor?: IColor;
    /** The default transparency of the clearance workflow */
    clearanceDefaultTransparent?: boolean;
    /** Increase the thickness of contours from eye dome lighting */
    edlRadius?: number;
    /** Increasing this value increases contrast on slopes and edges for eye dome lighting */
    edlStrength?: number;
    /** Bottom value of elevation range to display (in meters)*/
    elevationBottom?: number;
    /** Top value of elevation range to display (in meters) */
    elevationTop?: number;
    /** Array of color stops with the given colour to the gradient at the given offset.  (0.0 is the offset at one end of the gradient, 1.0 is the offset at the other end) */
    elevationGradient?: Array<[number, IColor]>;
    /** Maximum points to display */
    pointBudget?: number;
    /** Allows more point loading without changing point size */
    densityBias?: number;
    /** Chosen color type e.g. RGB, Classification or elevation */
    pointColorBy: PointColorType;
    /** Shape of each point e.g. square, circle or paraboloid */
    pointShape?: PointShape;
    /** The size of each point */
    pointSize?: number;
    /** Default or Eye dome lighting */
    shading?: ShadingOptions;
    /** Change point size using distance from camera */
    sizeAttenuation?: boolean;
    /** Array of color stops with the given colour to the gradient at the given offset.  (0.0 is the offset at one end of the gradient, 1.0 is the offset at the other end) */
    intensityGradient?: Array<[number, IColor]>;
    /** Range of possible values for the intensity (default: Vector2(0, 65536)) */
    intensityRange?: Vector2;
}
/** The data structure representing the file selection event */
export interface IFileSelectionData {
    /** Source - where the file selection ocurred */
    source: string;
    /** Connect file object */
    file: ConnectFile;
}
/** The data structure representing the multi file selection event */
export interface IFileCustomActionData {
    /** Source - where the file selection ocurred */
    source: string;
    /** Array of Connect file objects */
    files: ConnectFile[];
}
export interface HierarchyEntity {
    id: number;
    fileId: string;
    name: string;
}
export declare enum HierarchyType {
    Unknown = 0,
    SpatialHierarchy = 1,
    SpatialContainment = 2,
    Containment = 3,
    ElementAssembly = 4,
    Group = 5,
    System = 6,
    Zone = 7,
    VoidsElement = 8,
    FillsElement = 9,
    ConnectsPortToElement = 10,
    ConnectsPorts = 11,
    ServicesBuildings = 12,
    Positions = 13
}
export declare type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
interface ExplorerItem {
    id: string;
    name: string;
    type: "FILE" | "FOLDER";
    versionId?: string;
    revision?: number;
    createdOn?: string;
    modifiedOn?: string;
    size?: number;
    link?: string;
}
/**
 * The data structure representing a Trimble Connect File.
 */
export interface ConnectFile extends ExplorerItem {
    thumbnailUrl?: string[];
    status?: string;
    hash?: string;
}
/**
 * The data structure representing a Trimble Connect Folder.
 */
export interface ConnectFolder extends ExplorerItem {
    hasChildren?: boolean;
}
/**
 * The data structure representing the on project created event data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  in embed context of Trimble Connect Web.
 */
export interface ProjectCreated extends ConnectProject {
    /** status of the project creation */
    status: "success" | "failed";
}
/**
 * The data structure representing a Breadcrumb click in Trimble Connect Web embed context.
 */
export interface BreadcrumbSelectData {
    /** Name of the selected module */
    name: string;
    /** Route of the selected module */
    path: string;
}
/**
 * The data structure representing the module loaded in embed context of Trimble Connect Web.
 */
export interface PageLoaded {
    /** Name of the module loaded */
    page: string;
}
/**
 * The data structure representing the projects list view mode changed event data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  in embed context of Trimble Connect Web.
 */
export interface ViewModeChanged {
    /** Embed projects list view mode */
    viewMode: string;
}
/**
 * The data structure representing the projects list region changed event data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  in embed context of Trimble Connect Web.
 */
export interface RegionChanged {
    /** Embed projects list region */
    region: string;
}
export {};
