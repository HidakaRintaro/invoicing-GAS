export interface DatabaseRes {
    results: Database[]
}

interface Database {
    object: string,
    id: string,
    properties: {
        [key: string]: {
            type: "date" | "number" | "relation" | "title",
            date?: {
                start: string,
                end: string
            },
            number?: number,
            relation?: [
                {
                    id: string
                }
            ]
        }
    }
}