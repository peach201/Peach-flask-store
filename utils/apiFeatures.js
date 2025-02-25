export default class APIFeatures {
    constructor(query, queryString) {
        this.query = query;
        this.queryString = queryString;
        this.page = 1;
        this.limit = 20;
    }

    filter() {
        const queryObj = { ...this.queryString };
        const excludedFields = ['page', 'sort', 'limit', 'fields'];
        excludedFields.forEach(el => delete queryObj[el]);

        // Advanced filtering
        let queryStr = JSON.stringify(queryObj);
        queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);

        this.filterQuery = JSON.parse(queryStr);

        // Handle category/size arrays
        if (this.filterQuery.categories) {
            this.filterQuery.categories = { $in: this.filterQuery.categories.split(',') };
        }
        if (this.filterQuery.sizes) {
            this.filterQuery.sizes = { $in: this.filterQuery.sizes.split(',') };
        }

        this.query = this.query.find(this.filterQuery);
        return this;
    }

    sort() {
        if (this.queryString.sort) {
            const sortBy = this.queryString.sort.split(',').join(' ');
            this.query = this.query.sort(sortBy);
        } else {
            this.query = this.query.sort('-createdAt');
        }
        return this;
    }

    limitFields() {
        if (this.queryString.fields) {
            const fields = this.queryString.fields.split(',').join(' ');
            this.query = this.query.select(fields);
        }
        return this;
    }

    paginate() {
        this.page = parseInt(this.queryString.page, 10) || 1;
        this.limit = parseInt(this.queryString.limit, 10) || 20;
        const skip = (this.page - 1) * this.limit;

        this.query = this.query.skip(skip).limit(this.limit);
        return this;
    }
}