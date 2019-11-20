const path = require('path')
const fse = require('fs-extra')
const { merge, endsWith } = require('ramda')
const YAML = require('js-yaml')
const traverse = require('traverse')

const isYamlPath = (filePath) => endsWith('.yml', filePath) || endsWith('.yaml', filePath)

const isJsonPath = (filePath) => endsWith('.json', filePath)

const parseFile = (filePath, contents, options = {}) => {
  if (isJsonPath(filePath)) {
    return JSON.parse(contents)
  } else if (isYamlPath(filePath)) {
    return YAML.load(contents.toString(), merge(options, { filename: filePath }))
  } else if (filePath.endsWith('.slsignore')) {
    return contents.toString().split('\n')
  }
  return contents.toString().trim()
}

const fileExistsSync = (filePath) => {
  try {
    const stats = fse.lstatSync(filePath)
    return stats.isFile()
  } catch (e) {
    return false
  }
}

const readFileSync = (filePath, options = {}) => {
  const contents = fse.readFileSync(filePath, 'utf8')
  return parseFile(filePath, contents, options)
}

const getConfig = (fileName) => {
  const ymlFilePath = path.join(process.cwd(), `${fileName}.yml`)
  const yamlFilePath = path.join(process.cwd(), `${fileName}.yaml`)
  const jsonFilePath = path.join(process.cwd(), `${fileName}.json`)

  try {
    if (fileExistsSync(ymlFilePath)) {
      return readFileSync(ymlFilePath)
    }
    if (fileExistsSync(yamlFilePath)) {
      return readFileSync(yamlFilePath)
    }
  } catch (e) {
    // todo currently our YAML parser does not support
    // CF schema (!Ref for example). So we silent that error
    // because the framework can deal with that
    if (e.name !== 'YAMLException') {
      throw e
    }
    return false
  }

  if (fileExistsSync(jsonFilePath)) {
    return readFileSync(jsonFilePath)
  }

  return false
}

const resolveConfig = (config) => {
  const regex = /\${(\w*:?[\w\d.-]+)}/g
  let variableResolved = false
  const resolvedConfig = traverse(config).forEach(function(value) {
    const matches = typeof value === 'string' ? value.match(regex) : null
    if (matches) {
      let newValue = value
      for (const match of matches) {
        const referencedPropertyPath = match.substring(2, match.length - 1).split('.')
        const referencedTopLevelProperty = referencedPropertyPath[0]
        if (/\${env\.(\w*:?[\w\d.-]+)}/g.test(match)) {
          newValue = process.env[referencedPropertyPath[1]]
          variableResolved = true
        } else {
          if (!config[referencedTopLevelProperty]) {
            throw Error(`invalid reference ${match}`)
          }

          if (!config[referencedTopLevelProperty].component) {
            variableResolved = true
            const referencedPropertyValue = path(referencedPropertyPath, config)

            if (referencedPropertyValue === undefined) {
              throw Error(`invalid reference ${match}`)
            }

            if (match === value) {
              newValue = referencedPropertyValue
            } else if (typeof referencedPropertyValue === 'string') {
              newValue = newValue.replace(match, referencedPropertyValue)
            } else {
              throw Error(`the referenced substring is not a string`)
            }
          }
        }
      }
      this.update(newValue)
    }
  })
  if (variableResolved) {
    return resolveConfig(resolvedConfig)
  }
  return resolvedConfig
}

const isComponentsProject = () => {
  const serverlessComponentFile = getConfig('serverless.component')
  const serverlessFile = getConfig('serverless')

  if (serverlessComponentFile || (serverlessFile && !serverlessFile.provider)) {
    return true
  }

  return false
}

const sleep = async (wait) => new Promise((resolve) => setTimeout(() => resolve(), wait))

module.exports = {
  getConfig,
  resolveConfig,
  isComponentsProject,
  fileExistsSync,
  sleep
}
