Projections = {};


if(!_.mapObject) {
	_.mixin({
		mapObject: function(obj, iteratee, context) {
			return _.object(_.keys(obj), _.map(obj, iteratee, context));
		}
	});
}

_.mixin({
	'setProps': function(destination) {
		_.each(_.rest(arguments), function(obj) {
			_.each(obj, function(value, key) {
				var keys = key.split('.');
				var lastKey = keys.pop();
				var context = _.reduce(keys, function(context, key) {
					return context[key] = context[key] || {};
				}, destination);
				context[lastKey] = value;
			});
		});
		return destination;
	},
});

var get = function(obj, path) {
	return _.reduce(path.split('.'), function(value, key) {
		if (_.isObject(value) && _.isFunction(value[key])) {
			return value[key]();
		} else if (_.isObject(value) && !_.isUndefined(value[key])) {
			return value[key];
		} else {
			return null;
		}
	}, obj);
};

var transformWithFieldsObject = function(fields, doc) {
	var row = _.mapObject(fields, function(fieldValue, fieldKey) {
		var value;
		if(_.isFunction(fieldValue)) {
			value = fieldValue.call(doc, get(doc, fieldKey), doc);
		} else if(_.isString(fieldValue)) {
			value = get(doc, fieldValue);
		} else {
			value = get(doc, fieldKey);
		}
		return value;
	});
	return row;
};

_.extend(Mongo.Collection.prototype, {
	find: _.wrap(Mongo.Collection.prototype.find, function(f) {
		var result = f.apply(this, _.rest(arguments));
		if(_.isObject(result)) result._mongoCollection = this;
		return result;
	}),
});

ProjectedDocument = Projections.ProjectedDocument = function(doc) {
	_.extend(this, doc);
}

_.extend(ProjectedDocument.prototype, {
	'projection': function() {
		return instances[this._projectionCollectionId];
	},
	'originalDoc': function() {
		return this.originalCollection().findOne(this._id);
	},
	'originalCollection': function() {
		return instances[this._projectionCollectionId].sourceCollection();
	},
});

var defaultTransform = function(doc) {
	return new ProjectedDocument(doc);
};

var instances = [];


Projections.Collection = Mongo.Projection = function(sourceCursor, options) {
	var self = this;

	//Add to instances and save the id
	self._id = instances.length;
	instances.push(self);

	//Default options
	options = _.defaults(options || {}, {

	});
	options.projection = options.projection || options.fields;
	if(_.isFunction(options.projection)) {
		self._projection = options.projection;
	} else if(_.isObject(options.projection)) {
		self._fields = _.omit(options.projection, ['_id', '_projectionCollectionId']);
		self._projection = _.partial(transformWithFieldsObject, self._fields);
	} else {
		self._projection = _.identity;
	}

	if(options.transform || options.transform === null) {
		self._transformOut = options.transform;
	} else {
		self._transformOut = defaultTransform;
	}

	//Set up sourceCursor reactivity
	self._sourceCursorDep = new Tracker.Dependency();
	if(_.isFunction(sourceCursor)) {
		Tracker.autorun(function() {
			self._sourceCursor = sourceCursor();
			self._sourceCursorDep.changed();
		});
	} else {
		self._sourceCursor = sourceCursor;
	}

	var collection = self._collection = new Mongo.Collection(null, {transform: self._transformOut});
	var transformIn = self._projection;

	Tracker.autorun(function() {
		if(self._computations) {
			_.each(self._computations, function(c, key) {
				c.stop();
				collection.remove(key);
			});
		}
		self._computations = {};
		var sourceTransform = self.sourceTransform();
		var sourceCollection = self.sourceCollection();
		self._observer = self.sourceCursor().observe({
			'addedAt': function(doc) {
				var _id = doc._id;
				self._computations[_id] = Tracker.autorun(function(c) {
					var doc = sourceCollection.findOne(_id, {transform: sourceTransform});
					var rowDoc = _.extend(transformIn(doc), {
						_projectionCollectionId: self._id,
					});
					if(c.firstRun) {
						rowDoc._id = _id;
						collection.insert(_.setProps({}, rowDoc));
					} else {
						collection.update(_id, _.setProps({}, rowDoc));
					}
				});
			},
			'removed': function(doc) {
				self._computations[doc._id].stop();
				if(collection.remove(doc._id)) {
					delete self._computations[doc._id];
				}
			},
		});
	});
}

_.extend(Projections.Collection.prototype, {
	find: function() {
		return this._collection.find.apply(this._collection, arguments);
	},
	findOne: function() {
		return this._collection.findOne.apply(this._collection, arguments);
	},
	sourceCursor: function() {
		this._sourceCursorDep.depend();
		return this._sourceCursor;
	},
	sourceTransform: function() {
		return this.sourceCursor().getTransform();
	},
	sourceCollection: function() {
		return this.sourceCursor()._mongoCollection;
	},
});
