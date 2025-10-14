/**
 * Data stucture representing data required by Property Panel
 */
export interface IPropertyPanelData {
    /**
     * Optional title to be used in the panel (where it can be applied).
     * If omitted, an internal default value is used.
     *
     * Title can e.g. be the entity name or type in single-selection.
     */
    title?: string;
    /**
     * List of model entities to display properties for.
     * For Trimble Connect compatible entities,
     * use the URL encoded [FRN notation](https://drive.google.com/file/d/1gR1PEhrR58WGlrZt8PPWqTPbjvbEwXVK/view) for `entities` ID array.
     *
     * E.g. an entity with IFC GUID `3CqVfw$t15ihB2vPgB1wri` should be placed to the array in form `frn:entity:3CqVfw%24t15ihB2vPgB1wri`
     */
    entities?: string[];
}
export declare type DetailsPanelViewMode = "edit" | "view";
/**
 * The API for operations related to the Trimble Connect Property Panel web component.
 */
export interface PropertyPanelAPI {
    /** Callback for Property Panel to request the entities to display the properties for */
    getPropertyPanelData: () => Promise<IPropertyPanelData>;
    /** Callback for Property Panel to request opening the Property Set Manager */
    openPropertySetManager?: () => Promise<void>;
    /** Callback for Property Panel to request closing itself */
    close?: () => Promise<void>;
    /** Callback to inform host about the current Property panel mode.
     *  If mode is "edit", Property Panel has possibly unsaved changes.
     */
    changeMode?: (mode: DetailsPanelViewMode) => Promise<void>;
}
