import { RichText } from "./richText"

export interface Page {
    object: string,
    id: string,
    properties: {
        [key: string]: {
            type: "number" | "select" | "title"
            number?: number,
            select?: {
                name: string
            },
            title?: RichText[]
        }
    }
}