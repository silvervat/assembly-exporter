/**
 * The name of the UI elements.
 * @deprecated ''*MenuToolbar*'' option has been deprecated. It will be removed in future.
 */
export declare type UIElementName = "MainToolbar" | "MenuToolbar" | "SidePanel" | "DetailsPanel" | "DetailsPanel.ToDos" | "DetailsPanel.Views" | "DetailsPanel.Clashes";
/** The state of the UI elements. */
export declare type UIElementState = "collapsed" | "expanded" | "visible" | "hidden";
/**
 * The data structure representing the state of an UI element in Trimble Connect 3D Viewer.
 */
export interface ElementState {
    /** The name of the UI element */
    name: UIElementName;
    /** The state of the UI element */
    state: UIElementState;
}
/** The navigation submenu of the Trimble Connect project extension. */
export interface ExtensionSubMenu {
    /** The action command string */
    command: string;
    /** The title of the submenu */
    title: string;
    /** icon of the submenu */
    icon?: string;
}
/** The navigation main menu of the Trimble Connect project extension. */
export interface ExtensionMainMenu {
    /** The title of the submenu */
    title: string;
    /** icon of the submenu */
    icon?: string;
    /** The action command string */
    command?: string;
    /** The array of submenu of the extensions */
    subMenus?: ExtensionSubMenu[];
}
/** The data structure representing the custom file action button in explorer right panel */
interface FileActionButton {
    /** Button label */
    label: string;
    /** Based on this flag the button will be disabled */
    disabled?: boolean;
    /** while clicking on the custom button this string will be passed back to the extension as extension.fileViewClicked event payload */
    onClick?: string;
}
/** Additional alert text which will be shown next to the custom action button */
interface FileActionMessage {
    /** Actual text needs to be displayed inside the alert*/
    text: string;
    /** type of the alert */
    type: "info" | "warning" | "error";
}
/** The data structure representing the custom file action button with alert message in right panel */
export interface ICustomFileActionButton {
    /** Custom file action button */
    button: FileActionButton;
    /** Alert message for custom file action button */
    message?: FileActionMessage;
}
export declare type File3DStatus = "unloaded" | "assimilating" | "assimilationFailed" | "assimilationBusy" | "loading" | "loadingWithoutCancel" | "loaded" | "loadingFailed";
export interface FileStatusIcon {
    /** Status of the file icon inside models panel*/
    fileStatus: File3DStatus;
    /** Text explains the error state */
    fileStatusMessage?: string;
}
export declare enum TabPanelId {
    /** Internal features */
    Models = "models",
    Layers = "layers",
    Attachments = "attachments",
    ToDos = "todos",
    Views = "views",
    ClashSets = "clashes",
    Organizer = "organizer",
    DataTable = "contentbrowser",
    /** Built-in extensions */
    Topics = "topics",
    LiveCollaboration = "livecollaboration",
    StatusSharing = "statussharing",
    Connect2Fab = "connect2fab",
    QrMarkers = "qrmarkers",
    RealityCapture = "realitycapture"
}
/**
 * The API for operations related to Trimble Connect Web and 3D Viewer UI.
 */
export interface UIAPI {
    /** Gets all the UI elements and their states.
     * @returns The awaitable task that returns the UI elements and their states.
     */
    getUI(): Promise<ElementState[]>;
    /** Sets the state of the UI element.
     * @param state - The UI element state to be set
     * @returns The awaitable task
     */
    setUI(state: ElementState): Promise<void>;
    /** Configures Trimble Connect web navigation menu from the Project extension.
     *  @param menu - Navigation menu object.
     *  @returns The awaitable task
     */
    setMenu(menu: ExtensionMainMenu): Promise<ExtensionMainMenu>;
    /** Activate the Trimble Connect web navigation submenu based on the command value from the project extension.
     *  @param command submenu command value.
     *  @returns The awaitable task
     */
    setActiveMenuItem(command: string): Promise<boolean>;
    /** Adds additional option along with the default Connect file view option. (this API currently available only for the built-in extensions in Timble Connect web)
     * @param fileActionConfig - The configuration object for the custom file action.
     * @returns The awaitable task that returns the current Trimble Connect user.
     */
    addCustomFileAction(fileActionConfig: IFileActionConfig[]): Promise<boolean>;
    /** Get all enabled 3D viewer UI tab components in the current project.
     *  These tabs can be opened via the {@link UIAPI.openUITab} method.  */
    getUITabIds(): Promise<TabPanelId[]>;
    /**
     * Opens the given UI tab component. Only components enabled in the project can be opened.
     * @param tabId - Id of an enabled UI tab component
     * @param args - Optional payload passed to the component. This argument is component-specific.
     */
    openUITab(tabId: TabPanelId, args?: any): Promise<void>;
}
export interface IFileActionConfig {
    /** Connect fileId */
    fileId: string;
    /** Button object which will be rendered for the specified fileIds */
    actionButton?: ICustomFileActionButton;
    /** Array of custom actions will be included in file explorer rightpanel for the given fileId */
    actionDropdown?: string[];
    /** File status inside the 3DViewer models panel*/
    fileStatusIcon?: FileStatusIcon;
    /** Overrides the default  explorer thumbnail. Passing empty string will bring back the default thumbnail. */
    thumbnailUrl?: string;
}
export {};
