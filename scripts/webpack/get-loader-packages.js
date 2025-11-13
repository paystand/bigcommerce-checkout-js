const path = require('path');

const { projects } = require('../../workspace.json');

const tsLoaderIncludes = [];
const aliasMap = {};

for (const [packageName, packageConfig] of Object.entries(projects)) {
    // Handle both string and object project configurations
    const packagePath = typeof packageConfig === 'string' ? packageConfig : packageConfig.root;
    const packageSrcPath = path.join(__dirname, '../../', `${packagePath}/src`);

    tsLoaderIncludes.push(packageSrcPath);

    aliasMap[`@bigcommerce/checkout/${packageName}`] = packageSrcPath;
}

module.exports = {
    aliasMap,
    tsLoaderIncludes,
};
