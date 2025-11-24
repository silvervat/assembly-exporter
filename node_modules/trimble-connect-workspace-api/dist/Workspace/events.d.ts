import { ModelsPanelConfig } from "./ModelsPanelAPI";
import { ConnectProject, ProjectSettings } from "./ProjectAPI";
import { Selection, PointIcon, ViewerSettings, PresentationUpdate, SectionPlaneUpdate, SectionBoxUpdate, AttachmentTypeSelected } from "./ViewerAPI";
import { ModelSpec, PointPickedDetail, IFileSelectionData, IFileCustomActionData, PageLoaded, ViewModeChanged, RegionChanged, ProjectCreated, ConnectFile, ConnectFolder, BreadcrumbSelectData } from "./common";
import { Camera } from "./ViewAPI";
import { ConnectUser, UserSettings } from "./UserAPI";
import { DataTableConfig } from "./DataTableAPI";
import { ViewAction } from "./ViewAPI";
import { IPropertyPanelData } from "./PropertyPanelAPI";
import { MarkupUpdate } from "./MarkupAPI";
/** The changed data */
export interface Change<T> {
    /** The old data */
    old?: T;
    /** The new data */
    new?: T;
}
/** The changed data */
export interface ChangeWithInfo<T> extends Change<T> {
    /** The array indicating the changed properties name */
    changes: string[];
    /** The old data */
    old?: T;
    /** The new data */
    new?: T;
}
/**
 * The interface for event argument.
 */
export interface EventArgument<TData> {
    data: TData;
    action?: string;
    origin?: {
        /** For client application use only. If `true`, the event originates from a Workspace API
         * function call invoked by this client.
         */
        isSelf?: boolean;
    };
}
/** The changed project data */
export interface ChangedProject extends Change<ConnectProject> {
}
/** The changed project settings */
export interface ChangedProjectSettings extends ChangeWithInfo<Partial<ProjectSettings>> {
}
/** The changed user settings */
export interface ChangedUserSettings extends ChangeWithInfo<Partial<UserSettings>> {
}
/** The event argument for the access token event */
export interface AccessTokenEventArgument extends EventArgument<string> {
}
/** The event argument for the extension closing event */
export interface ExtensionCloseEventArgument extends EventArgument<boolean> {
}
/** The event argument for the session invalid event */
export interface SessionInvalidEventArgument extends EventArgument<boolean> {
}
/** The event argument for the session log out event */
export interface SessionLogOutEventArgument extends EventArgument<boolean> {
}
/** The event argument for the commands to the extension */
export interface ExtensionCommandEventArgument extends EventArgument<string> {
}
/** The event argument for broadcasting data from host to extensions */
export interface ExtensionBroadcastEventArgument extends EventArgument<any> {
}
/** The event argument for the active project changed event */
export interface ProjectChangedEventArgument extends EventArgument<ChangedProject> {
}
/** The event argument for the active project settings changed event */
export interface ProjectSettingsChangedEventArgument extends EventArgument<ChangedProjectSettings> {
}
/** The event argument for the user settings changed event */
export interface UserSettingsChangedEventArgument extends EventArgument<ChangedUserSettings> {
}
/** The event argument for the user details changed event */
export interface UserDetailsChangedEventArgument extends EventArgument<ConnectUser> {
}
/** The event argument for the selection changed event */
export interface SelectionChangedEventArgument extends EventArgument<Selection> {
}
/** The event argument for the icon picked event */
export interface IconPickedEventArgument extends EventArgument<PointIcon[]> {
}
/** The event argument for the point picked event */
export interface PointPickedEventArgument extends EventArgument<PointPickedDetail> {
}
/** The event argument for the camera changed event */
export interface CameraChangedEventArgument extends EventArgument<Camera> {
}
/** The event argument for the model state changed event */
export interface ModelStateChangedEventArgument extends EventArgument<ModelSpec> {
}
/** Event argument for `viewer.onModelReset` event */
export interface ModelResetEventArgument extends EventArgument<undefined> {
}
/** The changed viewer settings */
export interface ChangedViewerSettings extends ChangeWithInfo<Partial<ViewerSettings>> {
}
/** The event argument for the viewer settings changed event */
export interface ViewerSettingsChangedEventArgument extends EventArgument<ChangedViewerSettings> {
}
/** The changed viewer tool */
export interface ChangedViewerTool extends Change<string> {
}
/** The event argument for the viewer tool changed event */
export interface ViewerToolChangedEventArgument extends EventArgument<ChangedViewerTool> {
}
/** The changed data table settings */
export interface ChangedDataTableConfig extends ChangeWithInfo<Partial<DataTableConfig>> {
}
/** The event argument for the data table config changed event */
export interface DataTableConfigChangedEventArgument extends EventArgument<ChangedDataTableConfig> {
}
/** The changed models panel settings */
export interface ChangedModelsPanelConfig extends ChangeWithInfo<Partial<ModelsPanelConfig>> {
}
/** The event argument for the models panel config changed event */
export interface ModelsPanelConfigChangedEventArgument extends EventArgument<ChangedModelsPanelConfig> {
}
/** The event argument for the view spec changed event in the viewer */
export interface ViewActionEventArgument extends EventArgument<ViewAction> {
}
/** The event argument for the attachment added event in the viewer */
export interface AttachmentTypeSelectedEventArgument extends EventArgument<AttachmentTypeSelected> {
}
/** The event argument for the property panel model changed event */
export interface PropertyPanelModelArgument extends EventArgument<IPropertyPanelData> {
}
/** The event argument for the embed on action event */
export interface EmbedSessionInvalidEventArgument extends EventArgument<boolean> {
}
/** The event argument for viewer presentation event */
export interface ViewerPresentationChangedArgument extends EventArgument<PresentationUpdate> {
}
/** The event argument for section plane change event */
export interface SectionPlaneChangedArgument extends EventArgument<SectionPlaneUpdate> {
}
/** The event argument for section box change event */
export interface SectionBoxChangedArgument extends EventArgument<SectionBoxUpdate> {
}
/** The event argument for markup change event */
export interface MarkupChangedArgument extends EventArgument<MarkupUpdate> {
}
/** The event argument for the on file select event */
export interface FileSelectedArgument extends EventArgument<IFileSelectionData> {
}
/** The event argument for the on multi file select event */
export interface FileCustomActionArgument extends EventArgument<IFileCustomActionData> {
}
/** The event argument for the embed page loaded event */
export interface EmbedPageLoadedArgument extends EventArgument<PageLoaded> {
}
/** The event argument for the embed projects vlist view mode change event */
export interface EmbedProjectsViewModeChangedArgument extends EventArgument<ViewModeChanged> {
}
/** The event argument for the embed projects list region change event */
export interface EmbedProjectsRegionChangedArgument extends EventArgument<RegionChanged> {
}
/** The event argument for the embed projects list region change event */
export interface EmbedProjectCreatedEventArgument extends EventArgument<ProjectCreated> {
}
/** Type schemas for the workspace event data */
export interface EventToArgMap {
    "extension.closing": ExtensionCloseEventArgument;
    "extension.accessToken": AccessTokenEventArgument;
    "extension.sessionInvalid": SessionInvalidEventArgument;
    "extension.sessionLogOut": SessionLogOutEventArgument;
    "extension.command": ExtensionCommandEventArgument;
    "extension.broadcast": ExtensionBroadcastEventArgument;
    "extension.userSettingsChanged": UserDetailsChangedEventArgument;
    "extension.fileSelected": FileSelectedArgument;
    "extension.fileViewClicked": FileSelectedArgument;
    "extension.onFileCustomAction": FileCustomActionArgument;
    "modelsPanel.onConfigChanged": ModelsPanelConfigChangedEventArgument;
    "project.onChanged": ProjectChangedEventArgument;
    "project.onSettingsChanged": ProjectSettingsChangedEventArgument;
    "user.onSettingsChanged": UserSettingsChangedEventArgument;
    "viewer.onAttachmentTypeSelected": AttachmentTypeSelectedEventArgument;
    "viewer.onCameraChanged": CameraChangedEventArgument;
    "viewer.onIconPicked": IconPickedEventArgument;
    "viewer.onModelStateChanged": ModelStateChangedEventArgument;
    "viewer.onModelReset": ModelResetEventArgument;
    "viewer.onPicked": PointPickedEventArgument;
    "viewer.onSelectionChanged": SelectionChangedEventArgument;
    "viewer.onSettingsChanged": ViewerSettingsChangedEventArgument;
    "viewer.onToolChanged": ViewerToolChangedEventArgument;
    "viewer.onPresentationChanged": ViewerPresentationChangedArgument;
    "viewer.onSectionPlaneChanged": SectionPlaneChangedArgument;
    "viewer.onSectionBoxChanged": SectionBoxChangedArgument;
    "viewer.onMarkupChanged": MarkupChangedArgument;
    "datatable.onConfigChanged": DataTableConfigChangedEventArgument;
    "view.onViewAction": ViewActionEventArgument;
    "propertyPanel.onModelChanged": PropertyPanelModelArgument;
    "embed.session.invalid": EmbedSessionInvalidEventArgument;
    "embed.session.refreshed": AccessTokenEventArgument;
    "embed.onAction": EmbedOnActionEventArgument;
    "embed.pageLoaded": EmbedPageLoadedArgument;
    "embed.projects.viewModeChanged": EmbedProjectsViewModeChangedArgument;
    "embed.projects.regionChanged": EmbedProjectsRegionChangedArgument;
    "embed.projects.onCreated": EmbedProjectCreatedEventArgument;
}
/** The IDs of the internal application events */
export declare type EventId = keyof EventToArgMap;
/** The type of the event data */
export declare type WorkspaceEventData<TEvent extends EventId> = EventToArgMap[TEvent];
/**
 * The callback signature for events emitted by the Trimble Connect 3D Viewer client.
 * @param event - The event identifier
 * @param data  - The event data
 */
export declare type EventCallback<TEvent extends EventId, TData extends EventToArgMap[TEvent]> = (event: TEvent, data: TData) => void;
/**
 * The signature of the callback in the event of changed project.
 * The first parameter is the event name and the second parameter contains the data of the changed active project
 */
export declare type ProjectChangedCallback = EventCallback<"project.onChanged", ProjectChangedEventArgument>;
/**
 * The signature of the callback in the event of changed project settings.
 * The first parameter is the event name and the second parameter contains the data of the changed active project settings
 */
export declare type ProjectSettingsChangedCallback = EventCallback<"project.onSettingsChanged", ProjectSettingsChangedEventArgument>;
/**
 * The signature of the callback in the event of changed user settings.
 * The first parameter is the event name and the second parameter contains the data of the changed user settings
 */
export declare type UserSettingsChangedCallback = EventCallback<"user.onSettingsChanged", UserSettingsChangedEventArgument>;
/**
 * The signature of the callback in the event of changed user details.
 * The first parameter is the event name and the second parameter contains the data of the changed user settings
 */
export declare type UserDetailsChangedEventCallback = EventCallback<"extension.userSettingsChanged", UserDetailsChangedEventArgument>;
/**
 * The signature of the callback in the event of file selected from the explorer.
 * The first parameter is the event name and the second parameter contains the data of the selected file.
 */
export declare type FileSelectArgumentEventCallback = EventCallback<"extension.fileSelected", FileSelectedArgument>;
/**
 * The signature of the callback in the event of file selected from the explorer.
 * The first parameter is the event name and the second parameter contains the data of the selected file.
 */
export declare type FileViewClickedArgumentEventCallback = EventCallback<"extension.fileViewClicked", FileSelectedArgument>;
/**
 * The signature of the callback in the event of file multi selected from the explorer.
 * The first parameter is the event name and the second parameter contains the data of the selected file.
 */
export declare type FileCustomActionArgumentEventCallback = EventCallback<"extension.onFileCustomAction", FileCustomActionArgument>;
/**
 * The signature of the callback in the event of changed selection.
 * The first parameter is the event name and the second parameter contains the selection data.
 */
export declare type SelectionCallback = EventCallback<"viewer.onSelectionChanged", SelectionChangedEventArgument>;
/**
 * The signature of the callback in the event of icon picking.
 * The first parameter is the event name and the second parameter contains the data of picked icon(s).
 */
export declare type IconPickCallback = EventCallback<"viewer.onIconPicked", IconPickedEventArgument>;
/**
 * The signature of the callback in the event of point picking.
 * The first parameter is the event name and the second parameter contains the data of the picked point(s).
 */
export declare type PickCallback = EventCallback<"viewer.onPicked", PointPickedEventArgument>;
/**
 * The signature of the callback in the event of changed camera.
 * The first parameter is the event name and the second parameter contains the data of the new camera data.
 */
export declare type CameraChangedCallback = EventCallback<"viewer.onCameraChanged", CameraChangedEventArgument>;
/**
 * The signature of the callback in the event of changed model state.
 * The first parameter is the event name and the second parameter contains the state of the model.
 */
export declare type ModelStateChangedCallback = EventCallback<"viewer.onModelStateChanged", ModelStateChangedEventArgument>;
/**
 * The signature of the callback in the event of model reset.
 * The first parameter is the event name.
 */
export declare type ModelResetCallback = EventCallback<"viewer.onModelReset", ModelResetEventArgument>;
/**
 * The signature of the callback in the event of access token.
 * The first parameter is the event name and the second parameter contains the access token.
 */
export declare type AccessTokenCallback = EventCallback<"extension.accessToken", AccessTokenEventArgument>;
/**
 * The signature of the callback in the event of changed models panel config.
 * The first parameter is the event name and the second parameter contains the data of the changed models panel config
 */
export declare type ModelsPanelConfigChangedCallback = EventCallback<"modelsPanel.onConfigChanged", ModelsPanelConfigChangedEventArgument>;
/**
 * The signature of the callback in the event of extension close.
 * The parameter is the event name.
 */
export declare type ExtensionClosingCallback = EventCallback<"extension.closing", ExtensionCloseEventArgument>;
/**
 * The signature of the callback in the event of session invalid.
 * The parameter is the flag indicating the session being invalid.
 */
export declare type SessionInvalidCallback = EventCallback<"extension.sessionInvalid", SessionInvalidEventArgument>;
/**
 * The signature of the callback in the event of session log out.
 * The parameter is the flag indicating the session being logged out.
 */
export declare type SessionLogOutCallback = EventCallback<"extension.sessionLogOut", SessionLogOutEventArgument>;
/**
 * The signature of the callback in the event of commands to the extension.
 * The parameter is the flag indicating the command was received.
 */
export declare type ExtensionCommandCallback = EventCallback<"extension.command", ExtensionCommandEventArgument>;
/**
 * The signature of the callback in the event a broadcast to the extension.
 * The parameter is any data broadcasted by another extension or the host application.
 */
export declare type ExtensionBroadcastCallback = EventCallback<"extension.broadcast", ExtensionBroadcastEventArgument>;
/**
 * The signature of the callback in the event of changed viewer settings.
 * The first parameter is the event name and the second parameter contains the data of the changed viewer settings
 */
export declare type ViewerSettingsChangedCallback = EventCallback<"viewer.onSettingsChanged", ViewerSettingsChangedEventArgument>;
/**
 * The signature of the callback in the event of changed viewer tool.
 * The first parameter is the event name and the second parameter contains the data of the changed viewer tool
 */
export declare type ViewerToolChangedCallback = EventCallback<"viewer.onToolChanged", ViewerToolChangedEventArgument>;
/**
 * The signature of the callback in the event of changed data table config.
 * The first parameter is the event name and the second parameter contains the data of the changed data table config
 */
export declare type DataTableConfigChangedCallback = EventCallback<"datatable.onConfigChanged", DataTableConfigChangedEventArgument>;
/**
 * The signature of the callback in the event of changed view spec.
 * The first parameter is the event name and the second parameter contains the data of the changed view spec
 */
export declare type ViewActionCallback = EventCallback<"view.onViewAction", ViewActionEventArgument>;
/**
 * The signature of the callback in the event of changed property panel model.
 * The first parameter is the event name and the second parameter contains the data of the changed property panel model
 */
export declare type PropertyPanelModelChangedCallback = EventCallback<"propertyPanel.onModelChanged", PropertyPanelModelArgument>;
/**
 * The signature of the callback in the event of embed session invalid.
 * The parameter is the flag indicating the embed session being invalid.
 */
export declare type EmbedSessionInvalidEventCallback = EventCallback<"embed.session.invalid", EmbedSessionInvalidEventArgument>;
/**
 * The signature of the callback in the event of access token.
 * The first parameter is the event name and the second parameter contains the access token.
 */
export declare type AccessTokenRefreshedEventCallback = EventCallback<"embed.session.refreshed", AccessTokenEventArgument>;
export declare type SectionPlaneChangedCallback = EventCallback<"viewer.onSectionPlaneChanged", SectionPlaneChangedArgument>;
export declare type SectionBoxChangedCallback = EventCallback<"viewer.onSectionBoxChanged", SectionBoxChangedArgument>;
export declare type AttachmentTypeSelectedCallback = EventCallback<"viewer.onAttachmentTypeSelected", AttachmentTypeSelectedEventArgument>;
export declare type PresentationChangedCallback = EventCallback<"viewer.onPresentationChanged", ViewerPresentationChangedArgument>;
export declare type MarkupChangedCallback = EventCallback<"viewer.onMarkupChanged", MarkupChangedArgument>;
/**
 * The signature of the callback in the event of pageLoaded embed modules.
 * The first parameter is the event name and the second parameter contains the data of the loaded embedded module
 */
export declare type EmbedPageLoadedCallback = EventCallback<"embed.pageLoaded", EmbedPageLoadedArgument>;
/**
 * The signature of the callback in the event of project list view mode changed.
 * The first parameter is the event name and the second parameter is the project list view mode
 */
export declare type EmbedProjectsViewModeChangedCallback = EventCallback<"embed.projects.viewModeChanged", EmbedProjectsViewModeChangedArgument>;
/**
 * The signature of the callback in the event of project list region changed.
 * The first parameter is the event name and the second parameter is the project list region
 */
export declare type EmbedProjectsRegionChangedCallback = EventCallback<"embed.projects.regionChanged", EmbedProjectsRegionChangedArgument>;
/**
 * The signature of the callback in the event of project created.
 * The first parameter is the event name and the second parameter is the project created status with the project details
 */
export declare type EmbedProjectCreatedEventCallback = EventCallback<"embed.projects.onCreated", EmbedProjectCreatedEventArgument>;
export interface EmbedOnActionEventArgument extends EventArgument<ConnectFile | ConnectFolder | BreadcrumbSelectData | ConnectProject> {
}
/**
 * The signature of the callback in the event of onAction embed modules.
 * The first parameter is the event name and the second parameter contains the data of the onAction embedded module
 */
export declare type EmbedOnActionEventCallback = EventCallback<"embed.onAction", EmbedOnActionEventArgument>;
/** The supported event callbacks */
export declare type WorkspaceEventCallback = ProjectChangedCallback | ProjectSettingsChangedCallback | UserSettingsChangedCallback | UserDetailsChangedEventCallback | FileSelectArgumentEventCallback | FileViewClickedArgumentEventCallback | FileCustomActionArgumentEventCallback | SelectionCallback | IconPickCallback | PickCallback | CameraChangedCallback | ModelStateChangedCallback | AccessTokenCallback | ExtensionClosingCallback | SessionInvalidCallback | SessionLogOutCallback | ExtensionCommandCallback | ExtensionBroadcastCallback | ModelResetCallback | ModelsPanelConfigChangedCallback | ViewerSettingsChangedCallback | ViewerToolChangedCallback | DataTableConfigChangedCallback | ViewActionCallback | PropertyPanelModelChangedCallback | EmbedSessionInvalidEventCallback | AccessTokenRefreshedEventCallback | AttachmentTypeSelectedCallback | SectionPlaneChangedCallback | SectionBoxChangedCallback | PresentationChangedCallback | MarkupChangedArgument | EmbedOnActionEventCallback | EmbedPageLoadedCallback | EmbedProjectsViewModeChangedCallback | EmbedProjectsRegionChangedCallback | EmbedProjectCreatedEventCallback;
