/**
 * The available and supported unit systems.
 */
export declare type UnitSystemType = "metric" | "imperial" | "ussurveyfeet" | "custom";
/**
 * The data structure representing the length unit.
 */
export declare type MetricLengthUnit = "mm" | "cm" | "m" | "km";
export declare type ImperialLengthUnit = "in" | "ft" | "yd" | "mi";
export declare type USSurveyFeetLengthUnit = "sIN" | "sFT" | "sYD" | "sMI";
export declare type LengthUnit = MetricLengthUnit | ImperialLengthUnit | USSurveyFeetLengthUnit;
/**
 * The data structure representing the area unit.
 */
export declare type MetricAreaUnit = "mm2" | "cm2" | "m2" | "km2";
export declare type ImperialAreaUnit = "in2" | "ft2" | "yd2";
export declare type AreaUnit = MetricAreaUnit | ImperialAreaUnit;
/**
 * The data structure representing the volume unit.
 */
export declare type MetricVolumeUnit = "mm3" | "cm3" | "m3" | "km3";
export declare type ImperialVolumeUnit = "in3" | "ft3" | "yd3";
export declare type VolumeUnit = MetricVolumeUnit | ImperialVolumeUnit;
/**
 * The data structure representing the mass unit.
 */
export declare type MetricMassUnit = "mg" | "g" | "kg" | "t";
export declare type ImperialMassUnit = "oz" | "lb" | "ton";
export declare type MassUnit = MetricMassUnit | ImperialMassUnit;
/**
 * The data structure representing the angle unit.
 */
export declare type AngleUnit = "deg" | "rad" | "deg-min-sec";
/**
 * The data structure representing a Trimble Connect project.
 */
export interface ConnectProject {
    /** The project identifier */
    id: string;
    /** The project name */
    name?: string;
    /** The project location */
    location?: string;
    /** The project location CRS Address */
    address?: ProjectAddress;
    /** The project CRS details */
    crs?: CRS;
}
export interface ProjectAddress {
    /** Project address geometry */
    geometry?: string;
    /** Project address text */
    text?: string;
}
export interface CRS {
    /** Project CRS base64 encoded csi */
    csib64?: string;
    /** Project CRS name */
    name?: string;
}
/**
 * The data structure representing the formatting settings.
 */
export interface IFormattingSettings {
    unitSystem?: UnitSystemType;
    lengthUnit?: LengthUnit;
    lengthDecimals?: number;
    lengthFormatting?: "decimal" | "fractional";
    lengthFractions?: number;
    lengthMeasurementUnit?: LengthUnit;
    lengthMeasurementDecimals?: number;
    lengthMeasurementFormatting?: "decimal" | "fractional";
    lengthMeasurementFractions?: number;
    areaUnit?: AreaUnit;
    areaDecimals?: number;
    volumeUnit?: VolumeUnit;
    volumeDecimals?: number;
    massUnit?: MassUnit;
    massDecimals?: number;
    angleUnit?: AngleUnit;
    angleDecimals?: number;
    genericDecimals?: number;
}
/**
 * The data structure representing the project settings.
 */
export interface ProjectSettings {
    /** The formatting settings */
    formatting: IFormattingSettings;
}
/** A flattened version of TCPS UserDetails interface */
export interface UserDetails {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    status: "ACTIVE" | "PENDING" | "REMOVED";
    company: {
        id: string;
        name: string;
        website: string;
        image: string;
    };
    companyAdmin: boolean;
    language: string;
    createdOn: string;
    modifiedOn: string;
    podLocation: string;
    thumbnail: string;
    timeZone: string;
    title: string;
    role?: string;
    tiduuid: string;
    viewerBackground: {
        r: number;
        g: number;
        b: number;
        a: number;
    };
}
/**
 * The API for operations related to Trimble Connect projects.
 */
export interface ProjectAPI {
    /** Gets the current Trimble Connect project asynchronously.
     * @returns The awaitable task that returns the current Trimble Connect project.
     */
    getProject(): Promise<ConnectProject>;
    /** Sets the current Trimble Connect project asynchronously.
     * @param projectId - The project identifier
     * @returns The awaitable task.
     */
    setProject(projectId: string): Promise<void>;
    /** Gets the current project settings asynchronously.
     * @returns The awaitable task that returns the current project settings.
     */
    getSettings(): Promise<ProjectSettings>;
    /** Gets the current project members asynchronously.
     * @returns The awaitable task that returns the current project members.
     */
    getMembers(): Promise<UserDetails[]>;
    /** Get the current project details from the Trimble Connect project extension.
     *  @deprecated Use {@link ProjectAPI.getProject} instead.
     *  @returns The awaitable task
     */
    getCurrentProject(): Promise<ConnectProject>;
}
