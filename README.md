#Projections

This package allows you to create collections from your cursors. ”Why would I want to do that”, you might ask. Let me show you an example.

##Example

Let's say you have a collection of blog posts called `Posts` and you store which users have liked the post by storing a list of user IDs in each post document, like this:

```javascript
{_id: 'tryxTtPjgD6kj6gNH', title: 'Hello, world!', content: '…', likes: ['Sb5nQPFjLhSHBdytM']},
{_id: 'gzC5GNNf3X5gCZiMM', title: 'My second post', content: '…', likes: ['RQij2rwibnWgiKAYk', '8KpzuFWDGdjghhgpv']},
{_id: '6K7GYjXukSkgTkchH', title: 'A not so fun post', content: '…', likes: []}
```

And you want to list the posts sorted by number of likes to create a "Popular Posts" list. That would be complicated, especially on the client since Mongo aggregation is not implemented there yet.

Instead you use this package and create a second collection named `PostsWithLikesCount` like this:

```javascript
PostsWithLikesCount = new Projections.Collection(Posts.find(), {
	projection: {
		likesCount: function() {
			return this.likes.length;
		}
	}
});
```

Then when you call `PostsWithLikesCount.find({}, {sort {likesCount: -1}})` you'll get the following result:

```javascript
{_id: 'tryxTtPjgD6kj6gNH', likesCount: 1},
{_id: 'gzC5GNNf3X5gCZiMM', likesCount: 2},
{_id: '6K7GYjXukSkgTkchH', likesCount: 0}
```

The `find` method of a `Projections.Collection` works just like that of a regular `Mongo.Collection` so you can provide a selector and other options as well:

```javascript
PostsWithLikesCount.find({likesCount: {$gt: 0}}, {sort {likesCount: -1}});
```
Which gives you this:
```javascript
{_id: 'gzC5GNNf3X5gCZiMM', likesCount: 2},
{_id: 'tryxTtPjgD6kj6gNH', likesCount: 1}
```

##Documentation

###new Projections.Collection(cursor, [options])
Constructs a new collection based on `cursor`.

####cursor
A `Mongo.Cursor` instance returned by `collection.find` or a function that returns such a cursor. Provide a function if you want to use reactive functions a s part of the cursors query, for example:

```javascript
PostsByMe = new Projections.Collection(function() {
	return Posts.find({
		author_id: Meteor.userId()
	});
});
```

####options
Available options are:

- `projection`: An object specifying fields that the documents in this collection will have (see "Fields specifier" below), or a map function that will be run on each document. The function recieves the source document as the first argument and should return a new object that will be inserted into the new collection. Example:

	```javascript
	PostsWithLikesCount = new Projections.Collection(Posts.find(), {
		projection: function(doc) {
			doc.likesCount = doc.likes.length;
			return doc;
		}
	});
	```

- `transform`: Similar to the `transform` option of `new Mongo.Collection`, this option specifies how documents will be transformed when they are retrieved from this collection with `find()` och `findOne()`.

####Fields specifier
The projection option can be is a dictionary whose keys are field names and whose values are either a function, a string or `1`, depending on what effect you want:

```javascript
{
	//The function gets the original documents value of that field as the first argument and `this` is the original document itself:
	'likesCount': function(value) {
		return this.likes.length;
	},
	'excerpt': function(value) {
		return _.prune(this.content, 140, '...');
	},
	//Use a string to copy a value from another field into this one:
	'originalTitle': 'title',
	//You can access subdocuments and helpers (methods of the document) the same way. If the document had a `author` method to get the user that wrote the post you could just write the following to get the username of that user:
	'writtenBy': 'author.username',
	//Set the value to 1 to simply copy it:
	'title': 1
}
```


