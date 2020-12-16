# apostrophe-media-sources

A set of modules that ease browse and import of web-compatible image content from various media sources, including DAMs and Unsplash, into Apostrophe's media library.

## How to install

You need to already have an Apostrophe project in which you will install `apostrophe-media-sources`.
This module will override `apostrophe-images`, adding the possibility to browse different images providers.

For now, only `apostrophe-media-sources-unsplash` has been implemented, this module is part of the `apostrophe-media-sources` bundle, so you don't need to install it.

This module will be available on `npm` soon, for now, you can still clone it to have a look.

## Configuration

To configure this modules, you should add this module and the connectors in the `app.js` of your project :
```javascript
    modules: {
    'apostrophe-media-sources': {},
    'apostrophe-media-sources-unsplash': {
      accessKey: 'my-access-key'
    },
  }
```

Notice that the `Unsplash` Api require to create a free developer account which will provide you an access key.

Alternatively you may use an environment variable, to avoid storing keys in your source code.

## Create your own connector

What we call a connector is a module which connects the apostrophe image library to a specific provider.

Each module must have a `mediaSourceConnector` option :
```javascript
    self.options.mediaSourceConnector = {
      standardFilters: [
        {
          name: 'orientation',
          // We add a dependencies options, because for some providers,
          // a filter can be modified if another is set (this feature isn't stable)
          dependsOn: [ 'search' ]
        },
        {
          name: 'search'
        }
      ],
      customFilters: [ // You can add custom filters for a specific provider
        {
          name: 'color',
          label: 'Color',
          type: 'select',
        }
      ],
      propertyLabels: { // You can modify the labels of the preview form
        likes: 'Number Of Likes'
      },
      totalResults: 5000, // Total of results you want to return
      perPage: 20 // Results per page
    };
```

Here are all the standard filters handled by `apostrophe-media-sources`:
* Search
* Orientation (Notice that your `choices` method should return some for this filter)

A connector must have two methods declared in its `construct`,
those will be called by `apostrophe-media-sources` :
* `self.find` (req, filters):
  You get gere the filters selected by the user.
  This one must get the data from the provider and format it, it has to return
  Images, this is an array of images which have been formatted this way:

  ```javascript
  {
      mediaSourceId, // The image ID from the provider
      title,
      description,
      width, // Number
      height, // Number
      thumbLink, // For listing
      previewLink, // For preview button
      likes, // Number
      tags, // Array of strings
      categories,
      downloadLink, // Download Url
      createdAt
  }
  ```

* `self.download` (req, file, tempPath):
The file param, is the one you already formatted in the `find` method (see just above)
Don't worry about multiple files import, we handle this part.
We provide the `tempPath` which is the path to the temp folder where to download the image.
You simply have to import your image in this folder and to return the image name (with extension).
We take care of the attachment and image piece creation, as well as to delete temporary images.

* `self.choices` (req, filters)
This method should return the available choices depending on the already selected filters.
Can be static if there are no filters dependencies for a provider.
This method is executed during every search.