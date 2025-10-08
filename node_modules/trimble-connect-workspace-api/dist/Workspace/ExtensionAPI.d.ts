import { Viewer3DEmbedProperties } from "./EmbedAPI";
/** The state of the UI elements. */
export declare type Permission = "accesstoken";
/** The Extension type. */
export declare type PlacementType = "panel" | "properties" | "settings" | "popover" | "page";
/** Possible events back from the Trimble Connect Web application to Trimble Connect project extension. */
export declare type ExtensionEvents = "extension.command" | "extension.accessToken" | "extension.userSettingsChanged";
export declare const enum ExtensionType {
    Project = "project",
    Viewer = "3dviewer"
}
/** The Extension source */
export interface ExtensionSetting {
    /** @hidden The Extension identifier */
    id?: string;
    /** @hidden The URL of the Extension */
    pluginUrl?: string;
    /** @hidden The badge of the Extension */
    badge?: string;
    /** The URL of the Extension */
    url: string;
    /** The title of the Extension */
    title: string;
    /** The Extension type
     * - Default value is ["project"] if the extension added in project settings.
     * - Default value is ["3dviewer"] if the extension added in 3dviewer settings.
     * - Extension with ["project", "3dviewer"] can use the extension.getHost {@link ExtensionAPI.getHost} to identify the extension host type.
     */
    extensionType?: ExtensionType[];
    /** Short description about the extension */
    description?: string;
    /** Whether the Extension is enabled */
    enabled?: boolean;
    /** The placement type of the Extension */
    type?: PlacementType;
    /** The URL of the info page  */
    infoUrl?: string;
    /** The icon URL of the Extension */
    icon?: string;
    /** applicable for "properties" type extension in 3dviewer */
    height?: string;
    /** The URL of the Extension manifest */
    manifestUrl?: string;
    /** Project extension settings command */
    configCommand?: string;
}
/** Route key for navigating the Trimble Connect Web application to a specific route */
export declare type IRouteKey = "settings-extensions" | "settings-details" | "3dviewer";
/**
 * The API for operations related to the Trimble Connect web plug-ins.
 */
export interface ExtensionAPI {
    /** Configures the Extension.
     *  @param config - The plug-in configuration
     *  @returns The awaitable task
     */
    configure(config: ExtensionSetting): Promise<boolean>;
    /** Broadcasts a message to other plug-ins.
     *  @param message - The message to be broadcast
     *  @returns The awaitable task
     */
    broadcast(message: any): Promise<boolean>;
    /** Requests permission to get the accessToken from the application.
     * @returns The status for requested permission.
     */
    requestPermission(permission: Permission): Promise<string>;
    /** Set the extension status.
     *  @param message - The extension status message of the Trimble Connect project extension.
     *  @returns The awaitable task
     */
    setStatusMessage(message: string): Promise<boolean>;
    /** Get the current status message of the Trimble Connect project extension.
     *  @deprecated Will be removed in the future release.
     *  @returns The awaitable task
     */
    getStatusMessage(): Promise<string>;
    /** Configures the Trimble Connect project extension.
     *  @deprecated Use {@link ExtensionAPI.requestPermission} instead.
     *  @param permission - type of the permssion. For now only accesstoken is available.
     *  @returns The awaitable task
     */
    getPermission(permission: Permission): Promise<string>;
    /** Go to the extension settings page from the Trimble Connect project extension.
     *  @deprecated Use {@link ExtensionAPI.goTo} instead.
     *  @returns The awaitable task
     */
    goToSettings(): Promise<boolean>;
    /** Go to a specific route/page from the Trimble Connect project extension.
     *  @returns The awaitable task
     */
    goTo(routeKey: IRouteKey, params?: Viewer3DEmbedProperties): Promise<boolean>;
    /**
     * @deprecated Use {@link ExtensionAPI.getHost} instead.
     * Host metadata */
    host?: {
        /** Host application name */
        name: string;
        /** Host application version information */
        version?: string;
    };
    /** Get the current host metadata
     * @returns The current host metadata
     */
    getHost: () => Promise<{
        name: ExtensionType;
    }>;
    /** Open tab of the invoking extension */
    requestFocus(): Promise<boolean>;
    /** Display a warning dialog before the extensions getting closed by the user
     * @param text - The warning message to be displayed, if not provided the prevent dialog will no longer appear.
     * @internal
     */
    preventClosing(text?: string): Promise<void>;
    /**
     * @hidden
     *  Selects the Connect Reference object and apply to the workspace viewers asynchronously.
     * @param type  - The Reference type. It can be one of the following:
     * - file - The Reference is a File type.
     * - url - The Reference is a URL type.
     * @param fileId - The Reference File Identifier. This will be empty when the Reference is not a File type.
     * @param versionId - The Reference File Version Identifier. This will be empty when the Reference is not a File type.
     * @param url - The Reference URL string. This will be empty when the Reference is not a URL type.
     * @returns The awaitable task
     */
    onAttachmentClicked(type: string, fileId: string, versionId: string, url: string): Promise<void>;
}
