// https://github.com/google/clasp/blob/master/docs/typescript.md#modules-exports-and-imports

// 型定義ファイルは出力されないのでOK
import { BlockChildrenRes } from "./types/notion/block"
import { SearchRes } from "./types/notion/search"


const main = () => {
    const token = PropertiesService.getScriptProperties().getProperty("AUTH_TOKEN") ?? ""
    const notionVersion = PropertiesService.getScriptProperties().getProperty("NOTION_VERSION") ?? "2021-02-22"

    const headers = setHeaders(token, notionVersion)

    // 請求書のIDを取得する (search)
    const invoicePageSearch = postSearch({ headers, payload: { query: "請求書" } })
    const invoicePageId = invoicePageSearch[0].id

    // 請求書の宛先・住所などのブロックのIDを取得 (block/child)
    let invoiceBaseInfoId = ""
    const invoicePageBlocks = getBlockChildren({ headers, blockId: invoicePageId })
    invoicePageBlocks.forEach((block) => {
        if (block.type === "table" && block.table?.table_width == 2) {
            invoiceBaseInfoId = block.id
        }
    })

    // 宛先・住所などを取得
    const invoiceBaseInfo = {
        destination: "",  // 宛先
        name: "",  // 氏名
        zipCode: "",  // 郵便番号
        address: "",  // 住所
        tel: "",  // 電話番号
        bank: "",  // 銀行・支店
        bankNumber: "",  // 口座番号
        bankName: "",  // 名義
    }
    const invoiceBaseInfoList = getBlockChildren({ headers, blockId: invoiceBaseInfoId })
    invoiceBaseInfoList.forEach((block) => {
        if (block.table_row === undefined) return
        const row = block.table_row.cells ?? []
        switch (row[0][0].plain_text) {
            case "宛先":
                invoiceBaseInfo.destination = row[1][0].plain_text
                break;
            case "氏名":
                invoiceBaseInfo.name = row[1][0].plain_text
                break;
            case "郵便番号":
                invoiceBaseInfo.zipCode = row[1][0].plain_text
                break;
            case "住所":
                invoiceBaseInfo.address = row[1][0].plain_text
                break;
            case "電話番号":
                invoiceBaseInfo.tel = row[1][0].plain_text
                break;
            case "銀行・支店":
                invoiceBaseInfo.bank = row[1][0].plain_text
                break;
            case "口座番号":
                invoiceBaseInfo.bankNumber = row[1][0].plain_text
                break;
            case "名義":
                invoiceBaseInfo.bankName = row[1][0].plain_text
                break;
        }
    })
    Logger.log(invoiceBaseInfo)

    // 現在日時でSearchしIDを取得 (search)
    const fmtDate = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM")
    const datePageSeach = postSearch({ headers, payload: { query: fmtDate } })
    const datePageId = datePageSeach[0]

    // 勤怠のTableと件名などのブロックのIDを取得 (block/child)

    // 件名・Noなどを取得 (block/child)

    // 勤怠情報を取得 (db/query)

    // 業務内容を取得 (pages) or その他の場合は別処理

    // 時間の計算

    // スプレッドシートに書き出し

    // PDF化

    // GoogleDriveに保存

    // PDFのURLをNotionに書き込み
}


// ====================
//  api
// ====================

interface postSearchProps {
    headers: {
        "content-type": string,
        "Authorization": string,
        "Notion-Version": string
    }
    payload: {
        query?: string
    }
}

interface getBlockChildrenProps {
    headers: {
        "content-type": string,
        "Authorization": string,
        "Notion-Version": string
    }
    blockId: string
}

const setHeaders = (token: string, notionVersion: string) => {
    return {
        'content-type': 'application/json; charset=UTF-8',
        'Authorization': 'Bearer ' + token,
        'Notion-Version': notionVersion,
    }
}

const postSearch = ({ headers, payload }: postSearchProps) => {
    const url = "https://api.notion.com/v1/search"
    const options = {
        method: 'post' as GoogleAppsScript.URL_Fetch.HttpMethod,
        headers,
        payload: JSON.stringify(payload)
    }
    const res: SearchRes = JSON.parse(UrlFetchApp.fetch(url, options).getContentText())
    return res.results
}

const getBlockChildren = ({ headers, blockId }: getBlockChildrenProps) => {
    const url = `https://api.notion.com/v1/blocks/${blockId}/children`
    const options = {
        method: "get" as GoogleAppsScript.URL_Fetch.HttpMethod,
        headers
    }
    const res: BlockChildrenRes = JSON.parse(UrlFetchApp.fetch(url, options).getContentText())
    return res.results
}