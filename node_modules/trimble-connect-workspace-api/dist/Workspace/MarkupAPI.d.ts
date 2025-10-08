import { ColorRGBA, Vector3 } from "./common";
export declare type PickType = "point" | "line" | "lineSegment" | "plane";
/** Data structure representing a measurement markup start or end pick */
export interface MarkupPick {
    /** X-coordinate in millimeters. */
    positionX: number;
    /** Y-coordinate in millimeters. */
    positionY: number;
    /** Z-coordinate in millimeters. */
    positionZ: number;
    /** The id of the model.
     *  The value is equivalent to {@link ModelSpec.id} */
    modelId?: string;
    /** Runtime id of the related object */
    objectId?: number;
    /** Static id of the related object */
    referenceObjectId?: string;
    /** Pick type */
    type?: PickType;
    /** In millimeters. Defined For pick type `line` and `lineSegment` */
    position2X?: number;
    /** In millimeters. Defined For pick type `line` and `lineSegment` */
    position2Y?: number;
    /** In millimeters. Defined For pick type `line` and `lineSegment` */
    position2Z?: number;
    /** Unit vector. Defined For pick type `plane` */
    directionX?: number;
    /** Unit vector. Defined For pick type `plane` */
    directionY?: number;
    /** Unit vector. Defined For pick type `plane` */
    directionZ?: number;
}
/** Data structure representing a markup */
export interface Markup {
    /** The optional unique markup identifier. */
    id?: number;
    /** The markup color if any. */
    color?: ColorRGBA;
}
/** Data structure representing a single point markup */
export interface PointMarkup extends Markup {
    /** The start point of the markup. */
    start: MarkupPick;
}
/** Data structure representing a line markup */
export interface LineMarkup extends PointMarkup {
    /** The ending point of the markup. */
    end: MarkupPick;
}
/** Data structure repesenting a freeform hand-drawn curve.
 * A single markup consists of multiple individual line
 * segments. Shorter segments allow higher resolution markups.
 */
export interface FreelineMarkup extends Markup {
    lines: LineMarkup[];
}
/** Data structure representing an arrow markup */
export interface ArrowMarkup extends LineMarkup {
}
/** Data structure representing a perpendicular measurement markup.
 *  The measured distance is between points defined by
 *  `mainLineStart` and `mainLineEnd`.
 *
 *
 *  The `start` and 'end' picks represent snapping points. Depending on the
 *  measurement axis, the coordinates of `mainLineStart` either equal to the coordinates of `start` pick, or
 *  the coordinates of `mainLineEnd` equal to the coordinates of `end` pick.
 */
export interface MeasurementMarkup extends LineMarkup {
    mainLineStart: MarkupPick;
    mainLineEnd: MarkupPick;
}
/** Data structure representing an angle measurement.
 * Object top level `position` properties define the vertex/intersection for the measured angle.
 * The `start` and `end` properties represent points in space. The arms of the angle are defined as lines from
 * vertex to `start` and `end`.
 *
 * If the vertex is not defined by the top level `position` properties, the `start` and `end` properties
 * represent lines or faces. The angle is calculated at the intersection of these two. */
export interface AngleMeasurementMarkup extends Markup {
    positionX?: number;
    positionY?: number;
    positionZ?: number;
    start: MarkupPick;
    end: MarkupPick;
}
export interface SlopeMeasurementMarkup extends Markup {
    start: MarkupPick;
    end: MarkupPick;
}
/** Data structure representing a text markup */
export interface TextMarkup extends LineMarkup {
    /** The text of the text markup. */
    text?: string;
}
/** Data structure representing a cloud markup */
export interface CloudMarkup extends Markup {
    /** The position of the cloud markup center. */
    position?: MarkupPick;
    /** The normal of the cloud markup. */
    normal?: Vector3;
    /** Width of half of the cloud in millimeters. (Total width is 2x the value) */
    width?: number;
    /** Height of half of the cloud in millimeters. (Total height is 2x the value) */
    height?: number;
}
export declare type MarkupType = "measurement" | "angleMeasurement" | "slopeMeasurement" | "pointMarkup" | "cloudMarkup" | "arrowMarkup" | "lineMarkup" | "freelineMarkup" | "textMarkup";
/** Payload for `viewer.onMarkupChanged` event */
export interface MarkupUpdate {
    action: "updated" | "removed" | "added";
    markupType: MarkupType;
    markup: MeasurementMarkup | AngleMeasurementMarkup | SlopeMeasurementMarkup | PointMarkup | CloudMarkup | ArrowMarkup | LineMarkup | FreelineMarkup | TextMarkup;
}
/**
 * The API for operations related to Markups.
 */
export interface MarkupAPI {
    /** Add new or update existing measurement markups in the viewer. Existing markup is replaced if
     * 'id' property points to an existing markup, otherwise a new markup is created.
     * @param measurements - The measurement markup objects
     * @returns The awaitable task containing the MeasurementMarkup objects added to the viewer.
     */
    addMeasurementMarkups(measurements: MeasurementMarkup[]): Promise<MeasurementMarkup[]>;
    /** Gets the measurement markups in the viewer
     * @returns The awaitable containing the MeasurementMarkup objects currently in the viewer
     */
    getMeasurementMarkups(): Promise<MeasurementMarkup[]>;
    /** Add new or update existing arrow markups in the viewer. Existing arrow markup is replaced if
     * 'id' property points to an existing markup, otherwise, a new arrow markup is created.
     * @param arrowMarkups - The arrow markup objects.
     * @returns The awaitable containing the ArrowMarkup objects added to the viewer.
     */
    addArrowMarkups(arrowMarkups: ArrowMarkup[]): Promise<ArrowMarkup[]>;
    /** Gets the arrow markups in the viewer.
     * @returns The awaitable containing the ArrowMarkup objects currently in the viewer.
     */
    getArrowMarkups(): Promise<ArrowMarkup[]>;
    /** Add new or update existing line markups in the viewer. Existing line markup is replaced if
     * 'id' property points to an existing markup, otherwise a new line markup is created.
     * @param lineMarkups - The section markup objects.
     * @returns The awaitable containing the LineMarkup objects added to the viewer.
     */
    addLineMarkups(lineMarkups: LineMarkup[]): Promise<LineMarkup[]>;
    /** Gets the line markups in the viewer.
     * @returns The awaitable containing the LineMarkup objects currently in the viewer.
     */
    getLineMarkups(): Promise<LineMarkup[]>;
    /** Add new or update existing text markups in the viewer. Existing text markup is replaced if
     * 'id' property points to an existing markup, otherwise a new text markup is created.
     * @param textMarkups - The text markup objects.
     * @returns The awaitable task containing the LineMarkup objects added to the viewer.
     */
    addTextMarkup(textMarkups: TextMarkup[]): Promise<TextMarkup[]>;
    /** Gets the text markups in the viewer.
     * @returns The awaitable containing the TextMarkup objects currently in the viewer.
     */
    getTextMarkups(): Promise<TextMarkup[]>;
    /** Add new or update existing cloud markups in the viewer. Existing cloud markup is replaced if
     * 'id' property points to an existing markup, otherwise, a new cloud markup is created.
     * @param cloudMarkups - The cloud markup objects.
     * @returns The awaitable task containing the CloudMarkup objects added to the viewer.
     */
    addCloudMarkup(cloudMarkups: CloudMarkup[]): Promise<CloudMarkup[]>;
    /** Gets the cloud markups in the viewer.
     * @returns The awaitable containing the CloudMarkup objects currently in the viewer.
     */
    getCloudMarkups(): Promise<CloudMarkup[]>;
    /** Add new or update existing single point markups in the viewer. Existing single point markup is replaced if
     * 'id' property points to an existing markup, otherwise, a new single point markup is created.
     * @param pointMarkups - The single point markup objects.
     * @returns The awaitable task containing the CloudMarkup objects added to the viewer.
     */
    addSinglePointMarkups(pointMarkups: PointMarkup[]): Promise<PointMarkup[]>;
    /** Gets the single point markups in the viewer.
     * @returns The awaitable containing the PointMarkup objects currently in the viewer.
     */
    getSinglePointMarkups(): Promise<PointMarkup[]>;
    /**
     * Add freeline markups to the viewer
     * @param freelineMarkups
     */
    addFreelineMarkups(freelineMarkups: FreelineMarkup[]): Promise<FreelineMarkup[]>;
    /**
     * Get freeline markups in the viewer
     */
    getFreelineMarkups(): Promise<FreelineMarkup[]>;
    /**
     * Add angle markups to the viewer
     * @param angleMarkups
     */
    addAngleMarkups(angleMarkups: AngleMeasurementMarkup[]): Promise<AngleMeasurementMarkup[]>;
    /**
     * Get angle markups in the viewer
     */
    getAngleMarkups(): Promise<AngleMeasurementMarkup[]>;
    /**
     * Add slope measurement markups to the viewer
     * @param slopeMeasurementMarkups
     */
    addSlopeMeasurementMarkups(slopeMeasurementMarkups: SlopeMeasurementMarkup[]): Promise<SlopeMeasurementMarkup[]>;
    /**
     * Get slope measurement markups in the viewer
     */
    getSlopeMeasurementMarkups(): Promise<SlopeMeasurementMarkup[]>;
    /** Removes the markups in the viewer.
     * @param ids - The markup ids to be removed. If the parameter is undefined, all markups will be removed.
     * @returns The awaitable task.
     */
    removeMarkups(ids: number[] | undefined): Promise<void>;
}
