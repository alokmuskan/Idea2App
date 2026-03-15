// Shared data shapes (documentation-only, no runtime exports).
/**
 * @typedef {Object} Message
 * @property {"user"|"assistant"|"system"} role
 * @property {string} content
 * @property {string} [timestamp]
 */

/**
 * @typedef {Object} FileAction
 * @property {string} path
 * @property {string} content
 */

/**
 * @typedef {Object} ShellAction
 * @property {string} command
 */

/**
 * @typedef {Object} ProjectState
 * @property {string} name
 * @property {string[]} routes
 * @property {string[]} components
 * @property {string[]} dependencies
 * @property {string[]} recentFiles
 */

/**
 * @typedef {Object} Deployment
 * @property {string} [vercelUrl]
 * @property {string} [githubUrl]
 * @property {string} [deployedAt]
 */

export const types = {};
