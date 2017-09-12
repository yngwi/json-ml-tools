import extractNamespaces from '../utils/extractNamespaces';
import hasContent from '../utils/hasContent';
import isNil from '../utils/isNil';
import propOr from '../utils/propOr';
import types from '../constants/types';

// Creates the payload a mapping function will be called with
const createMappingPayload = (jmlFragment, content) => jmlFragment.type === types.TEXT
    ? {content: jmlFragment.text}
    : {content, attributes: jmlFragment.attributes, name: jmlFragment.name};

// Find a specific namespace in an array of namespaces. The value can be either an URI or a prefix
const findNamespace = (namespaces, value, isUri = true) => {
    for (let i = 0; i < namespaces.length; i++) {
        const {prefix, uri} = namespaces[i];
        if (isUri && uri === value || prefix === value) return namespaces[i];
    }
};

// Find the default namespace URI in an array of namespaces
const findDefaultUri = namespaces => {
    for (let i = 0; i < namespaces.length; i++) {
        const {prefix, uri} = namespaces[i];
        if (isNil(prefix)) return uri;
    }
};

// Find the matching mapping from the list of mappings according to the currently active name, namespaces and mapped namespaces
const findMapping = (mappings, activeName, activeNamespaces, options) => {
    let matchingMapping;
    const {namespaces: mappedNamespaces = []} = options;
    if (hasContent(activeNamespaces)) {
        const defaultUri = findDefaultUri(activeNamespaces);
        const {prefix, name} = separateNameParts(activeName);
        if (isNil(defaultUri) && isNil(prefix)) {
            matchingMapping = propOr(undefined, activeName, mappings);
        } else {
            const activeUri = hasContent(prefix) ? findNamespace(activeNamespaces, prefix, false).uri : defaultUri;
            const matchingPrefix = propOr(undefined, 'prefix', findNamespace(mappedNamespaces, activeUri));
            const prefixedActiveName = `${matchingPrefix}:${name}`;
            matchingMapping = mappings[prefixedActiveName];
        }
    } else {
        matchingMapping = propOr(undefined, activeName, mappings);
    }
    return isNil(matchingMapping) ? mappings['*'] : matchingMapping;
};

// Do the actual mapping
const mapContent = (jmlFragment, activeNamespaces, content, mappings, options) => {
    const {skipEmpty = false} = options;
    const payload = createMappingPayload(jmlFragment, content);
    if (typeof mappings === 'function') {
        return mappings(payload);
    } else {
        const mapping = findMapping(mappings, jmlFragment.name, activeNamespaces, options);
        if (isNil(mapping)) {
            return undefined;
        } else if (skipEmpty && content === '') {
            return content;
        } else if (typeof mapping === 'function') {
            return mapping(payload);
        } else {
            return `<${mapping}>${content}</${mapping}>`;
        }
    }
};

// Separate an object name in its name and prefix
const separateNameParts = prefixedName => {
    const colonPosition = prefixedName.indexOf(':');
    const prefix = colonPosition === -1 ? undefined : prefixedName.substring(0, colonPosition);
    const name = prefixedName.substring(colonPosition + 1);
    return {prefix, name};
};

// Recursive walk through a whole JML tree, extract content and apply mappings
const transform = (jmlFragment, parentAttributes, mappings, options) => {
    const mergedAttributes = Object.assign({...parentAttributes}, propOr({}, 'attributes', jmlFragment));
    let childContent = '';
    const childFragments = propOr([], 'elements', jmlFragment);
    for (let i = 0; i < childFragments.length; i++) {
        const childFragment = childFragments[i];
        if (childFragment.type === types.TEXT && /\S*/.test(childFragment.text)) {
            childContent += childFragment.text;
        } else {
            const childTexts = transform(childFragment, mergedAttributes, mappings, options);
            if (!isNil(childTexts)) {
                childContent += childTexts;
            }
        }
    }
    return mapContent(jmlFragment, extractNamespaces(mergedAttributes), childContent, mappings, options);
};

// Validate the options object and throw errors if appropriate
const validateOptions = (options = {}) => {
    const {namespaces = []} = options;
    for (let i = 0; i < namespaces.length; i++) {
        if (isNil(namespaces[i].prefix)) throw Error(`Options not valid: ${JSON.stringify(namespaces[i])} doesn't have a prefix.`);
    }
};

/**
 * Serializes a JML object according to provided mappings. Content without mappings is removed.
 * @example
 * Mappings:
 * {
 *     'p': 'p',
 *     'head': 'h2',
 *     'href': ({attributes, content, name}) => { ...do something }
 *     '*': 'span' // wildcard
 * }
 * @param {Object} jmlObject The JML object
 * @param {function|Object} [mappings] The mappings, either as a single function applied to all elements or in form of key-value pairs that describe the mappings for each child object. Individual functional mappings are called with an object that contains the already serialized child content, the attribute object and the current objects' name. A '*' can be used as a wildcard for all not-mapped elements. <b>Note: To match a qualified object (that is in a namespace) the mapping needs to be prefixed and the matching namespace needs to be declared in options.namespaces!</b>
 * @param {Object} options The options object
 * @param {Object[]} [options.namespaces=[]] Namespace objects
 * @param {string} options.namespaces[].prefix The namespace prefix. This is mandatory!
 * @param {string} options.namespaces[].uri The namespace URI
 * @param {boolean} [options.skipEmpty=false] Whether or not to skip empty elements
 * @return {null|string} The transformed object or null if the root element isn't a valid XML-JS compatible object.
 */
export default (jmlObject, mappings, options = {}) => {
    validateOptions(options);
    if (!hasContent(jmlObject) || !hasContent(mappings)) return '';
    return transform(jmlObject.elements[0], {}, mappings, options);
};