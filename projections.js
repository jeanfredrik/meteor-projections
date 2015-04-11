
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

var getFieldValue = function(obj, field) {
	return _.reduce(field.split('.'), function(value, key) {
		if (_.isObject(value) && _.isFunction(value[key])) {
			return value[key]();
		} else if (_.isObject(value) && !_.isUndefined(value[key])) {
			return value[key];
		} else {
			return null;
		}
	}, obj);
};

var makeRowDoc = function(doc, fields, extend) {
	var row = _.mapObject(fields, function(fieldOptions, fieldKey) {
		var value;
		if(_.isFunction(fieldOptions.value)) {
			value = fieldOptions.value(getFieldValue(doc, fieldKey), doc);
		} else if(_.isString(fieldOptions.value)) {
			value = getFieldValue(doc, fieldOptions.value);
		} else {
			value = getFieldValue(doc, fieldKey);
		}
		return value
	});
	row._id = doc._id;
	_.extend(row, extend || {});
	return row;
};

ProjectedDocument = function(doc) {
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

var transform = function(doc) {
	return new ProjectedDocument(doc);
};

var instances = [];

Projections = {};

Projections.Collection = Mongo.Projection = function(sourceCursor, options) {
	var self = this;

	//Add to instances and save the id
	self._id = instances.length;
	instances.push(self);

	//Default options
	options = _.defaults(options || {}, {
		fields: {},
	});
	options.fields = _.omit(options.fields, ['_id', '_projectionCollectionId']);

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

	var collection = self._collection = new Mongo.Collection(null, {transform: transform});
	var fields = options.fields;

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
					var rowDoc = makeRowDoc(doc, fields, {
						_projectionCollectionId: self._id,
					});
					if(c.firstRun) {
						collection.insert(_.setProps({}, rowDoc));
					} else {
						delete rowDoc._id;
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
		return this.sourceCursor().collection;
	},
});
