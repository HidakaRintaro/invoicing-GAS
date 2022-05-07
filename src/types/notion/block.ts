import { RichText } from "./richText"

export interface BlockChildrenRes {
    results: BlockChildren[]
}

interface BlockChildren {
    object: string
    id: string
    type: string
    table?: {
        table_width: number
        has_column_header: boolean
        has_row_header: boolean
    }
    child_database?: {
        title: string
    }
    paragraph?: {
        rich_text: [],
        color: string
    }
    table_row?: {
        cells: RichText[][]
    }
}

export interface Block {
    file?: {
        external: {
            url: string
        }
    }
}