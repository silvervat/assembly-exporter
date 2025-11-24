export declare type DataTableMode = "all" | "selected" | "visible";
/**
 * The data structure representing a Trimble Connect data table.
 */
export interface DataTableConfig {
    /** Flag to show/hide the component */
    show?: boolean;
    /** Mode: All | Selected | Visible  */
    mode?: DataTableMode;
    /** Current column set */
    columnSet?: ColumnSet;
    /** current global filter, matches rows having a visible cell containing this value */
    filter?: string;
}
/**
 * The data structure representing a Trimble Connect data table.
 */
export interface ColumnSet {
    /** Name of the column set */
    name: string;
    /** Columns that will be set for the column set */
    columns: Column[];
}
/**
 * The API for operations related to Trimble Connect Data table.
 * @remarks
 * Please note that this API's availability can change at runtime,
 * based on access permissions of the current user, loading state of the internal clients or the device screen size.
 * When the Data table APIs are not available, any usage of the API will result in a promise rejection. It is the integrator's responsibility to properly handle these cases.
 */
export interface DataTableAPI {
    /** Gets the current Data table config asynchronously.
     * @returns The awaitable task that returns the current Data table config
     */
    getConfig(): Promise<DataTableConfig>;
    /** Sets the Data table config
     * @param config - new config to be updated to data table
     */
    setConfig(config: DataTableConfig): Promise<void>;
    /** Gets all available columns asynchronously.
     * @returns The awaitable task that returns the available columns
     */
    getAllColumns(): Promise<Column[]>;
    /** Gets all stored presets asynchronously.
     * @returns The awaitable task that returns the stored presets
     */
    getColumnSets(): Promise<ColumnSet[]>;
}
/** Column Definition */
export interface Column {
    /** Custom label for the column. If missing then 'field' is used. */
    label?: string;
    /** Identifies the column in the Data Table's data sources. */
    field: string;
    /** If true then rows are grouped by values of this column. */
    grouped?: boolean;
    /** Sort direction of grouped values, used only when 'grouped' is true. */
    sortDirection?: SortDirection;
    /**
     * If true then Data Table aggregates values of this column, on group levels and in the footer.
     * The default - any the only available - aggregation function is SUM.
     */
    aggregated?: boolean;
}
export declare enum SortDirection {
    SORT_NONE = 0,
    SORT_UP = 1,
    SORT_DOWN = -1
}
