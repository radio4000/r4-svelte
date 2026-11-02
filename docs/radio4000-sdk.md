# @radio4000/sdk

JavaScript SDK for Radio4000. Works in browser and node.js.

See https://github.com/radio4000/sdk
For all methods see the types in `node_modules/@radio4000/sdk/dist/types/`.

If something isn't right, do not workaround it, propose a fix directly in the SDK.

## Example usage

```js
import {sdk} from '@radio4000/sdk'

const {data: channels, error} = await sdk.channels.readChannels()
```
