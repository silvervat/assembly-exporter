import { Vector3, Quaternion } from "./common";
import { ConnectUser } from "./UserAPI";
/** The camera projection type */
export declare type ProjectionType = "ortho" | "perspective";
/** The supported camera preset. */
export declare type CameraPreset = "top" | "bottom" | "front" | "back" | "left" | "right";
/**
 * The data structure representing a model camera data in the viewer.
 */
export interface Camera {
    /** The camera position. The coordinates are in meters. */
    position?: Vector3;
    /** The camera look-at position. The coordinates are in meters.
     * @deprecated use pitch and yaw instead
     */
    lookAt?: Vector3;
    /** The camera's up direction unit vector.
     * @deprecated use pitch and yaw instead
     */
    upDirection?: Vector3;
    /** Rotation quaternion */
    quaternion?: Quaternion;
    /** Rotation pitch angle in radians */
    pitch?: number;
    /** Rotation yaw angle in radians */
    yaw?: number;
    /** The camera projection type */
    projectionType?: ProjectionType;
    /** The camera field of view in degrees. Defaults to `60` in TC3DV. */
    fieldOfView?: number;
    /** The view scale */
    orthoSize?: number;
}
/**
 * The data structure representing camera options in the viewer.
 */
export interface CameraOptions {
    /** The camera position */
    animationTime?: number;
}
/**
 * The data structure representing a model camera data stored in the Trimble Connect.
 */
export interface ConnectCamera {
    /** The X-coordinate of the view camera target in millimeters */
    targetX?: number;
    /** The Y-coordinate of the view camera target in millimeters */
    targetY?: number;
    /** The Z-coordinate of the view camera target in millimeters */
    targetZ?: number;
    /** The X-coordinate of the view camera up-direction in millimeters */
    upX?: number;
    /** The Y-coordinate of the view camera up-direction in millimeters */
    upY?: number;
    /** The Z-coordinate of the view camera up-direction in millimeters */
    upZ?: number;
    /** The distance of the view camera. The distance is in meters */
    distance?: number;
    /** The pitch angle of the view camera in radians */
    pitch?: number;
    /** The yaw angle of the view camera in radians */
    yaw?: number;
    /** The projection type of the view camera */
    projectionType?: ProjectionType;
    /** The angle of the view camera in degrees */
    viewAngle: number;
    /** The scale of the view camera */
    viewScale: number;
}
/** The section plane. The `direction` properties create a unit vector */
export interface SectionPlane {
    /** Automatically assigned identifier. */
    id?: number;
    /** The X-coordinate of the direction vector */
    directionX?: number;
    /** The Y-coordinate of the direction vector */
    directionY?: number;
    /** The Z-coordinate of the direction vector */
    directionZ?: number;
    /** The X-coordinate of the position in millimeters */
    positionX?: number;
    /** The Y-coordinate of the position in millimeters */
    positionY?: number;
    /** The Z-coordinate of the position in millimeters */
    positionZ?: number;
    /** The identifier of the view to which the section plane belongs to */
    viewId?: string;
    /** Defines whether handles and border are visible or not */
    controlsVisible?: boolean;
}
/** Section box is a tool used to clip models within a 3D box in the viewer */
/** The data structure representing a section box in the viewer. */
export interface SectionBox {
    /** x coordinate of section box position (mm) */
    positionX: number;
    /** y coordinate of section box position (mm) */
    positionY: number;
    /** z coordinate of section box position (mm) */
    positionZ: number;
    /** section box size in x direction (mm) */
    sizeX: number;
    /** section box size in y direction (mm) */
    sizeY: number;
    /** section box size in z direction (mm) */
    sizeZ: number;
    /** rotation quaternion x component */
    rotationX: number;
    /** rotation quaternion y component */
    rotationY: number;
    /** rotation quaternion z component */
    rotationZ: number;
    /** rotation quaternion w component */
    rotationW: number;
    /** excluded version ids */
    excludedVersionIds?: string[];
}
/** The model view data */
export interface ViewSpec {
    /** The view identifier */
    id?: string;
    /** The view name */
    name?: string;
    /** The view description */
    description?: string;
    /** The identifier of the project to which the view belongs to */
    projectId?: string;
    /** Image as a base64 encoded [Data URL](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URLs) */
    imageData?: string;
    /** The camera data of the view */
    camera?: Camera | ConnectCamera;
    /** The section planes of the view */
    sectionPlanes?: SectionPlane[];
    /** An URL pointing to the view thumbnail */
    thumbnail?: string;
    /** User who created the view*/
    createdBy?: ConnectUser;
    /** Creation timestamp */
    createdOn?: string;
    /** User who last modified the view */
    modifiedBy?: ConnectUser;
    /** Modification timestamp */
    modifiedOn?: string;
    /** The version ids of models present in the view.
     *  The values are equivalent to {@link ModelSpec.versionId}s  */
    models?: string[];
    /** The ids of models present in the view.
     *  The values are equivalent to {@link ModelSpec.id}s  */
    files?: string[];
}
/** The model view information */
export interface ViewInfo {
    /** The view name */
    name: string;
    /** The view description */
    description?: string;
}
/** The view action information */
export interface ViewAction {
    /** The action */
    action: "created" | "updated" | "removed" | "set";
    view: ViewSpec;
}
/**
 * The API for operations related to the Trimble Connect 3D Viewer views.
 */
export interface ViewAPI {
    /** Creates a new Connect view object asynchronously.
     * @param view - The information of the new view
     * @returns The awaitable task that returns the newly created view data
     */
    createView(view: ViewInfo): Promise<ViewSpec>;
    /** Deletes an existing Connect view object asynchronously.
     * @param viewId - The view identifier
     * @returns The awaitable task
     */
    deleteView(viewId: string): Promise<boolean>;
    /** Gets the Connect view object asynchronously.
     * @param viewId  - The view identifier
     * @remarks Use the {@link ViewAPI.getViews} to get all the views.
     * @returns The awaitable task that returns the view with the specified identifier
     */
    getView(viewId: string): Promise<ViewSpec>;
    /** Gets the Connect view loaded in the viewer space.
     * @remarks Use the {@link ViewAPI.getView} to get a specific view.
     * @returns The awaitable task that returns the view.
     */
    getCurrentView(): Promise<ViewSpec>;
    /** Gets the Connect view objects asynchronously.
     * @returns The awaitable task that returns the views.
     */
    getViews(): Promise<ViewSpec[]>;
    /** Selects the Connect view object and apply to the workspace viewer asynchronously.
     * @param viewId  - The view identifier
     * @param loadWithOriginalModelVersion - Optional parameter to use original model versions. Default is false.
     * @remarks Uses latest model versions by default. Use the {@link ViewAPI.getViews} to get all the views.
     * @returns The awaitable task
     */
    selectView(viewId: string, loadWithOriginalModelVersion?: boolean): Promise<void>;
    /** Sets the workspace view specification asynchronously.
     * @param viewSpec  - The view specification
     * @returns The awaitable task
     */
    setView(view: ViewSpec): Promise<void>;
    /** Asynchronously updates a Connect view object. If the `view` argument only contains the `id` property,
     * the host application will update the given view with the data currently visible in the viewer.
     * @param view  - The view data
     * @returns The awaitable task that returns the updated view detail.
     */
    updateView(view: ViewSpec): Promise<ViewSpec>;
}
