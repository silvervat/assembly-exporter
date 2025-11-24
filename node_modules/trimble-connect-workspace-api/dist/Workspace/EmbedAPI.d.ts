/**
 * The configuration data structure representing the Trimble Connect embeddable 3D viewer.
 */
export interface Viewer3DEmbedProperties {
    /** Trimble Connect project ID which needs to be loaded in Trimble Connect 3D viewer */
    projectId?: string;
    /** The model ID that will be automatically loaded by 3D Viewer application, if it exists in the specified project */
    modelId?: string;
    /** The version ID of a model that will be automatically loaded by 3D Viewer application. */
    versionId?: string;
    /** The view ID that will be automatically loaded by 3D Viewer application. */
    viewId?: string;
    /** The todo ID that will be automatically loaded by 3D Viewer application. */
    todoId?: string;
    /** The clashset ID that will be automatically loaded by 3D Viewer application. */
    clashSetId?: string;
    /** The Topic ID that will be automatically loaded by 3D Viewer application. */
    topicId?: string;
}
/**
 * The data structure representing set user session in embeddable context of Trimble Connect Web.
 */
export interface EmbedSession {
    /** The User's access token (TID Access Token) is to be passed from the parent application, if not shareToken must passed otherwise the component will not be loaded  */
    accessToken?: string;
    /** Share token can be passed from the parent application instead of user's access token */
    shareToken?: string;
    /** Refresh token - if passed TCWEB will handle refreshing the access token and pass back whenever the tokens are refreshed. */
    refreshToken?: string;
    /** ExpiresIn - the access token expiry time. */
    expiresIn?: number;
}
/**
 * The data structure representing the Trimble Connect embeddable projects list features configuration.
 */
export interface ProjectEmbedFeatures {
    /** The region of the projects has to be passed like northAmerica, europe, asia or "" based on which the projects page is shown */
    enableRegion?: string;
    /** New project can be off/on based on that new project button is shown/hidden */
    enableNewProject?: boolean;
    /** Clone project can be off/on based on that clone project option is shown/hidden */
    enableCloneProject?: boolean;
    /** Leave project can be off/on based on that leave project option is shown/hidden */
    enableLeaveProject?: boolean;
    /** Thumbnail can be off/on based on that thumbnail of project is shown/hidden */
    enableThumbnail?: boolean;
    /** The view mode of the projects has to be passed like icon or list based on which the projects page is shown.By default, list view is shown. */
    embedViewMode?: string;
    /** The column names of the project can be passed which includes ["project-size", "last-visited", "last-modified"] based on that projects list is shown */
    projectsListColumns?: string[];
}
/**
 * The data structure representing the Trimble Connect embeddable explorer config.
 */
export interface ExplorerEmbedProperties {
    /** Project ID - that has to be loaded is to be passed here */
    projectId: string;
    /** The Trimble Connect File management component can be loaded in a different folder instead of the root folder if the proper folder ID is passed. By default it takes the root ID */
    folderId?: string;
    /** Enable the file and folder selection which will be displayed in the rightpanel. Default value is true. */
    enableSelect?: boolean;
    /** Enable the add dropdown button in Explorer. It will be enabled only when at least one of the properties (enableUploadFiles, enableCreateFolder) is true. The default value is true. */
    enableAdd?: boolean;
    /** Enable the explorer kebab menu(Permissions, Export to Excel, Checkin file(s), Checkout file(s), Reset to default columns). Default value is true. */
    enableExplorerKebabMenu?: boolean;
    /** Enable the Upload files option in the Add dropdown button */
    enableUploadFiles?: boolean;
    /** Enable the Create Folder option in the Add dropdown button */
    enableCreateFolder?: boolean;
    /**
     * Enable the All projects button in the folder tree left navbar.
     * Clicking on the All projects botton will send an event to host.
     * Host can call {@link EmbedAPI.initProjectList} to load the embeddable projects list.
     * On Project selection event, host can call {@link EmbedAPI.initFileExplorer} to load the embeddable explorer again for the selected project.
     */
    enableExplorerAllProjects?: boolean;
    /**
     * File type filter for the Explorer component. Allows showing only specific file types in the file explorer.
     * Provide an array of lowercase file extensions without dots.
     * System validates extensions against known supported formats and shows only matching files while keeping all folders visible.
     * If validation fails or invalid extensions are provided, all files will be shown as fallback.
     *
     * Valid: ["pdf", "txt", "docx", "png", "dwg"] - shows only specified file types
     * Invalid: ["aaaaa", ".txt", "@#$"] - rejects filter and shows all files
     */
    fileTypeFilter?: string[];
}
/**
 * The data structure representing the Trimble Connect embeddable projects list.
 */
export interface ProjectEmbedProperties {
    /**  Embeddable Project list component features config */
    projectEmbedFeatures?: ProjectEmbedFeatures;
}
/**
 * The API for operations related to Trimble Connect Web embeddable components.
 */
export interface EmbedAPI {
    /** Initializing Trimble Connect embeddable session asynchronously.
     * @param data - User session details in Trimble Connect Web embed context.
     * @returns The awaitable task that returns boolean.
     */
    setTokens(data: EmbedSession): Promise<boolean>;
    /** configure Trimble Connect embeddable 3D Viewer asynchronously.
     * @param config - 3D viewer config object.
     * @returns The awaitable task that returns boolean.
     */
    init3DViewer: (config: Viewer3DEmbedProperties) => Promise<boolean>;
    /** Initializing Trimble Connect embeddable project list page asynchronously.
     * @param config - Project list config object.
     * @returns The awaitable task that returns boolean.
     */
    initProjectList(config: ProjectEmbedProperties): Promise<boolean>;
    /** Initializing Trimble Connect embeddable explorer page asynchronously.
     * @param config - Project list config object.
     * @returns The awaitable task that returns boolean.
     */
    initFileExplorer(config: ExplorerEmbedProperties): Promise<boolean>;
    /** configure Trimble Connect embeddable explorer page asynchronously.
     * @param config - Project list config object.
     * @returns The awaitable task that returns boolean.
     */
    configFileExplorer(config: ExplorerEmbedProperties): Promise<boolean>;
}
