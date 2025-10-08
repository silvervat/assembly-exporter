/**
 * DISCLAIMER: This file contains the public interfaces and thus, upcoming changes should always be backwards-compatible.
 * It is only allowed to add new members.
 * DO NOT REMOVE existing members; instead, mark them as obsolete and create the new members.
 */
import { IDispatcher } from "../lib/dispatcher";
import { ProjectAPI, MarkupAPI, UIAPI, UserAPI, ViewAPI, ViewerAPI, ExtensionAPI, EmbedAPI, DataTableAPI, ModelsPanelAPI, PropertyPanelAPI, WorkspaceEventCallback, EventId, WorkspaceEventData } from "..";
export * from "./common";
export * from "./events";
export * from "./ExtensionAPI";
export * from "./EmbedAPI";
export * from "./MarkupAPI";
export * from "./ModelsPanelAPI";
export * from "./ProjectAPI";
export * from "./UIAPI";
export * from "./UserAPI";
export * from "./ViewAPI";
export * from "./ViewerAPI";
export * from "./DataTableAPI";
export * from "./PropertyPanelAPI";
export { preregister, isApplicationEmbedded, removeClient, sendEventToAllClients } from "../lib/publicAPI";
export { IDispatcher } from "../lib/dispatcher";
/** The API set which can be used to interact with the Trimble Connect web application.  */
export interface WorkspaceAPI {
    /** The API to interact with the Trimble Connect data table */
    dataTable: DataTableAPI;
    /** The API to add and interact with Extensions */
    extension: ExtensionAPI;
    /** The API initilize Trimble Connect embeddable components */
    embed: EmbedAPI;
    /** The API to add and interact with Trimble Connect Markups */
    markup: MarkupAPI;
    /** The API to interact with the Trimble Connect models panel */
    modelsPanel: ModelsPanelAPI;
    /** The API to interact with the Trimble Connect projects */
    project: ProjectAPI;
    /** The API to interact with the Trimble Connect web and 3D Viewer UI */
    ui: UIAPI;
    /** The API to interact with the Trimble Connect users */
    user: UserAPI;
    /** The API to interact with the Trimble Connect views */
    view: ViewAPI;
    /** The API to interact with the Trimble Connect 3D Viewer */
    viewer: ViewerAPI;
    /** The API to interact with property panel */
    propertyPanel?: PropertyPanelAPI;
}
/**
 * Client information.
 */
export interface IClient {
    /** Client dispatcher. */
    dispatcher: IDispatcher;
    /** Client identifier.
     *  Can be assigned by the host application in `preregister()` function argument.
     *  If `identifier` was not set in `preregister()`, Workspace API
     *  will automatically assign a unique UUID on `connect()`.
     */
    identifier?: string;
    /** Client origin, or undefined if the client has not connected yet. */
    origin?: string;
}
/**
 * Connects to the 3D Viewer application.
 * @param target The target dispatcher or the iframe hosting the 3D Viewer application.
 * @param onEvent The callback that receives the events dispatched from the 3D Viewer application.
 * @param timeout The optional timeout in milliseconds. If not specified default timeout is 10000ms
 * @returns A promise that resolves to the set of exposed external API from the 3D Viewer application.
 *          Use the exposed API to communicate with the 3D Viewer application.
 */
export declare function connect(target: Window | HTMLIFrameElement, onEvent?: WorkspaceEventCallback, timeout?: number): Promise<WorkspaceAPI>;
/** Expose Workspace API implementation to connected clients */
export declare function expose(apis: Partial<WorkspaceAPI>): void;
/** Send an event to connected clients
 * @param dispatcher an object able to call postMessage(). Most likely a window or an iframe contentWindow.
 * @param targetOrigin — The target origin, or "*" if any origin is allowed.
 *
 * Example of sending a message to a client in an iframe :
 *
 * `sendEvent(clientIframe.contentWindow, '*', 'extension.accessToken', {data:'abc123'})`
 */
export declare function sendEvent<T extends EventId>(dispatcher: IDispatcher, targetOrigin: string, event: T, data: WorkspaceEventData<T>): void;
/** Add this listener to window.addEventListener to receive messages from connected clients
 *
 * For example:
 *
 * `window.addEventListener("message", dispatcherEventListener)` */
export declare function dispatcherEventListener(e: MessageEvent<any>): Promise<void>;
/**
 * Returns the embeddable trimble connect web iframe src.
 * @param env Trimble connect API environment, which can be either int, qa, stage, and prod. Default value is prod.
 */
export declare function getConnectEmbedUrl(env?: "int" | "qa" | "stage" | "prod"): string;
